import { Transform } from "assemblyscript/dist/transform.js";
import { Parser, Module, DiagnosticCode, Node, ImportStatement, Compiler, Resolver, ClassPrototype, SourceKind, ElementKind, ClassDeclaration, CommonFlags, DecoratorFlags } from "assemblyscript/dist/assemblyscript.js";
import binaryenModule from "types:assemblyscript/src/glue/binaryen";
import lamearyen from "binaryen";
import { isClassDeclaration, isTypeName, isIdentifier, isImportStatement, hook, isClassPrototype } from "./util.js";
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

    // we're parsing `main.ts` as an entry file and
    // adding `exports.ts` as `index.ts`
    async addMain() {
        const relativePath = path.relative(this.baseDir, sdkDir);
        const mainPath = path.join(relativePath, "main.ts");
        let main = await this.readFile(mainPath, this.baseDir);
        this.program.parser.parseFile(main, mainPath, true);
        
        let exports = await this.readFile(path.join(relativePath, "exports.ts"), this.baseDir);
        let libSourceIndex = this.program.parser.sources.length;
        this.program.parser.parseFile(exports, path.join(relativePath, "index.ts"), false); // rename to index.ts
        this.libInternalPath = this.program.parser.sources[libSourceIndex].internalPath;
    }

    findEntrypoints() {
        for (const file of this.program.filesByName.values()) {
            if (file.source.sourceKind !== SourceKind.UserEntry || file.exports === null) {
                continue;
            }

            for (const [name, elem] of file.exports) {
                if (!isClassPrototype(elem)) continue;

                const decl = elem.declaration as ClassDeclaration;
                if (decl.isGeneric) continue;

                const _class = this.program.resolver.resolveClass(elem, null);
                if (_class) {
                    file.exports.delete(name);
                    this.contractTransform.trySetEntrypoint(_class, _class.declaration.name.range);
                }
            }
        }
    }

    afterInitialize() {
        const libFile = this.program.filesByName.get(this.libInternalPath!)!;
        const contractBase = libFile.lookupExport("Contract") as ClassPrototype;
        const eventBase = libFile.lookupExport("Event") as ClassPrototype;

        hook(Resolver, "resolveClass", (resolver, raw, prototype, typeArguments, ctxTypes, reportMode) => {
            if (prototype !== eventBase && !prototype.instanceMembers?.has("serialize") && prototype.extends(eventBase)) {
                this.eventTransform.fillSerializeImpl(prototype);
            }
            
            const _class = raw(prototype, typeArguments, ctxTypes, reportMode);

            if (_class !== null)
            if (prototype !== contractBase && !this.contractTransform.seen(_class) && _class.extendsPrototype(contractBase)) {
                this.contractTransform.add(_class);
            }
            
            return _class;
        });

        this.findEntrypoints();
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

        // allocate "gc_start" or use an existing cached allocation
        let gc_startStr = module.allocStringCached("gc_start");

        const gc_startExport = binaryen._BinaryenGetExport(module.ref, gc_startStr);
        const gc_startCName = binaryen._BinaryenExportGetValue(gc_startExport);
        const gc_startName = module.readStringCached(gc_startCName)!;
        module.removeExport("gc_start");
        module.removeFunction(gc_startName);

        // duplicate start into newFuncRef
        let params = binaryen._BinaryenFunctionGetParams(start);
        let results = binaryen._BinaryenFunctionGetResults(start);
        let body = binaryen._BinaryenFunctionGetBody(start);
        let newFuncRef = binaryen._BinaryenAddFunction(module.ref, gc_startCName, params, results, 0, 0, body);
        if (this.program.options.sourceMap || this.program.options.debugInfo) {
            let func = this.program.searchFunctionByRef(newFuncRef);
            if (func) func.addDebugInfo(module, newFuncRef);
        }

        // set the module's start function to null and remove the old start function
        module.setStart(0);
        module.removeFunction("~start");
    }
}
