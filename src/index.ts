import { Transform } from "assemblyscript/dist/transform.js";
import { Parser, Module, DiagnosticCode, Node, ImportStatement } from "assemblyscript/dist/assemblyscript.js";
import binaryenModule from "types:assemblyscript/src/glue/binaryen";
import lamearyen from "binaryen";
import { isClassDeclaration, isTypeName, isIdentifier, isImportStatement } from "./util.js";
import { fileURLToPath } from "url";
import path from "path/posix";
import { PurityInference } from "./PurityInference.js";
import { ContractTransform } from "./ContractTransform.js";
import { EventTransform } from "./EventTransform.js";

// make lamearyen not lame
const binaryen = lamearyen as unknown as typeof binaryenModule;

const sdkDir = fileURLToPath(new URL("../../assembly", import.meta.url));

export default class extends Transform {
    private abi: string[] = [];
    private contractTransform = new ContractTransform(this.program, this.abi);
    private eventTransform = new EventTransform(this.program, this.abi);
    private purityInference = new PurityInference(this.program);

    private libInternalPath: string | null = null;

    constructor() {
        super();
        this.addMain();
    }

    // we're adding `assembly/main.ts` as `assembly/index.ts` to the parser here
    async addMain() {
        const relativePath = path.relative(this.baseDir, sdkDir);
        let text = await this.readFile(path.join(relativePath, "main.ts"), this.baseDir);

        let libSourceIndex = this.program.parser.sources.length;
        this.program.parser.parseFile(text, path.join(relativePath, "index.ts"), true);
        this.libInternalPath = this.program.parser.sources[libSourceIndex].internalPath;
    }

    afterParse(parser: Parser) {
        for (const src of parser.sources) {
            if (src.isLibrary) continue;

            let importsContract = false;
            let importsEvent = false;

            function handleImport(stmt: ImportStatement): ImportStatement[] | null {
                if (stmt.declarations === null) {
                    parser.error(
                        DiagnosticCode.Transform_0_1,
                        stmt.range,
                        "stylus-sdk-as",
                        "Asterisk imports of the library are not allowed."
                    );
                    return null;
                }

                let libPath = stmt.path.value;
                if (path.basename(libPath).startsWith("index")) {
                    libPath = path.join(libPath, "..");
                }

                let imports: ImportStatement[] = [];

                for (const decl of stmt.declarations) {
                    if (decl.foreignName.text !== decl.name.text) {
                        parser.error(
                            DiagnosticCode.Transform_0_1,
                            decl.range,
                            "stylus-sdk-as",
                            "Aliasing imports of the library is not allowed."
                        );
                    }

                    switch (decl.name.text) {
                        case "Contract":
                            importsContract = true;
                            break;
                        case "Event": {
                            importsEvent = true;

                            // get path to "assembly/Event"
                            let eventPath;
                            if (libPath == ".") {
                                eventPath = "./" + path.join(libPath, "Event");
                            } else {
                                eventPath = path.join(libPath, "Event");
                            }

                            // import `Event`
                            imports.push(
                                Node.createImportStatement(
                                    [Node.createImportDeclaration(decl.foreignName, null, decl.range)],
                                    Node.createStringLiteralExpression(eventPath, stmt.path.range),
                                    stmt.range
                                )
                            );
                            break;
                        }
                    }
                }

                return imports;
            }

            for (let i = 0; i < src.statements.length; ++i) {
                const stmt = src.statements[i];

                if (isImportStatement(stmt)) {
                    if (this.libInternalPath === null) {
                        throw new Error("libInternalPath is null");
                    }

                    // TODO: handle multiple instances of this
                    if (stmt.internalPath == this.libInternalPath) {
                        // TODO: split up transforms

                        const imports = handleImport(stmt);

                        if (imports !== null) {
                            for (const newImport of imports) {
                                const internalPath = newImport.internalPath;
                                if (!parser.seenlog.has(internalPath)) {
                                    parser.backlog.push(internalPath);
                                }
                            }

                            src.statements.splice(i, 1, ...imports);
                            i += imports.length - 1;
                        }
                    }
                    continue;
                }

                if (!isClassDeclaration(stmt)) continue;

                const extendsType = stmt.extendsType;
                if (extendsType && isTypeName(extendsType.name)) {
                    const extendsName = extendsType.name.identifier.text;
                    if (extendsName === "Contract" && importsContract) {
                        this.contractTransform.add(parser, stmt);
                    } else if (extendsName === "Event" && importsEvent) {
                        this.eventTransform.add(parser, stmt);
                    }
                }

                // check for @entrypoint
                if (!stmt.decorators) continue;
                for (const decorator of stmt.decorators) {
                    if (!isIdentifier(decorator.name) || decorator.name.text !== "entrypoint") continue;
                    this.contractTransform.trySetEntrypoint(parser, stmt, decorator.range);
                }
            }
        }
    }

    afterInitialize() {
        this.eventTransform.fillSerializeImpls();
        this.contractTransform.createEntrypointRouter();
    }

    afterCompile() {
        const module = this.program.module;
        this.redirectBuiltInStart(module);
        this.writeFile("abi", this.abi.join("\n"), this.baseDir);
        this.purityInference.unhook();
    }

    // this function makes it so that _start is called just before contract invocation
    redirectBuiltInStart(module: Module) {
        const start = module.getFunction("~start");
        if (start === 0) return;

        this.program.warning(
            DiagnosticCode.Transform_0_1,
            null,
            "stylus-sdk-as",
            "Top level statements will be run every contract invocation."
        );

        module.removeFunction("assembly/index/_start");

        // allocate "assembly/index/_start" or use an existing cached allocation
        let cStr = module.allocStringCached("assembly/index/_start");

        // duplicate start into newFuncRef
        let params = binaryen._BinaryenFunctionGetParams(start);
        let results = binaryen._BinaryenFunctionGetResults(start);
        let body = binaryen._BinaryenFunctionGetBody(start);
        let newFuncRef = binaryen._BinaryenAddFunction(module.ref, cStr, params, results, 0, 0, body);
        if (this.program.options.sourceMap || this.program.options.debugInfo) {
            let func = this.program.searchFunctionByRef(newFuncRef);
            if (func) func.addDebugInfo(module, newFuncRef);
        }

        // set the module's start function to null and remove the old start function
        module.setStart(0);
        module.removeFunction("~start");
    }
}
