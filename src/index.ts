import { Transform } from "assemblyscript/dist/transform.js";
import {
    Parser,
    Module,
    DiagnosticCode,
    ClassPrototype,
    Statement,
    ClassDeclaration,
    FunctionPrototype,
    CommonFlags,
    Node,
    IfStatement,
    Type,
    ReportMode,
    TypeKind,
    ASTBuilder,
    NodeKind,
    Source,
    FieldDeclaration,
    PropertyPrototype,
    ImportStatement
} from "assemblyscript/dist/assemblyscript.js";
import binaryenModule from "types:assemblyscript/src/glue/binaryen";
import lamearyen from "binaryen";
import { id } from "ethers";
import { Range } from "types:assemblyscript/src/diagnostics";
import { SimpleParser } from "./SimpleParser.js";
import {
    isClassDeclaration,
    isTypeName,
    isIdentifier,
    isClassPrototype,
    isFunctionPrototype,
    isFunctionDeclaration,
    isBlock,
    isMethodDeclaration,
    isFieldDeclaration,
    isNamedTypeNode,
    isPropertyPrototype,
    isImportStatement
} from "./util.js";
import { Deserializer } from "./Deserializer.js";
import { Serializer } from "./Serializer.js";
import { ABI } from "./ABI.js";
import { fileURLToPath } from "url";
import path from "path/posix";
import { PurityInference } from "./PurityInference.js";

// make lamearyen not lame
const binaryen = lamearyen as unknown as typeof binaryenModule;

const sdkDir = fileURLToPath(new URL("../../assembly", import.meta.url));

export default class extends Transform {
    private entrypoint: ClassDeclaration | null = null;
    private libInternalPath: string | null = null;
    private contracts: Set<ClassDeclaration> = new Set();
    private events: Set<ClassDeclaration> = new Set();
    private indexed: Set<FieldDeclaration> = new Set();
    private abi: string[] = [];

    constructor() {
        super();
        (async () => {
            // we're adding `assembly/main.ts` as `assembly/index.ts` to the parser here
            const relativePath = path.relative(this.baseDir, sdkDir);
            let text = await this.readFile(path.join(relativePath, "main.ts"), this.baseDir);

            let libSourceIndex = this.program.parser.sources.length;
            this.program.parser.parseFile(text, path.join(relativePath, "index.ts"), true);
            this.libInternalPath = this.program.parser.sources[libSourceIndex].internalPath;
        })();
    }

    ensureContract(contract: ClassDeclaration) {
        const members = contract.members;
        for (let i = 0; i < members.length; ++i) {
            const member = members[i];

            // if it's a constructor declaration
            if (isMethodDeclaration(member) && member.name.kind === NodeKind.Constructor) {
                this.program.error(
                    DiagnosticCode.Transform_0_1,
                    contract.range,
                    "stylus-sdk-as",
                    "Contracts may not have a user-defined constructor."
                );

                members.splice(i, 1);
                i--;
            }
        }

        members.push(
            // add a constructor to the contract that throws an error
            SimpleParser.parseClassMember(
                `constructor() { ERROR("Do not instantiate contracts directly."); }`,
                contract
            ),

            // add the lazy address getter
            SimpleParser.parseClassMember(`private _$_address: Address | null = null;`, contract),
            SimpleParser.parseClassMember(
                `get address(): Address { 
                    const cached = this._$_address;
                    if (cached == null) { 
                        const address = contract_address(); 
                        this._$_address = address; 
                        return address; 
                    } 
                    return cached;
                }`,
                contract
            )
        );
    }

    ensureEvent(parser: Parser, event: ClassDeclaration, src: Source) {
        const members = event.members;
        let indexedCount = 0; // counter for the number of Indexed<T> fields, since we can't have more than 3

        for (const member of members) {
            // check if the current member is a field declaration with an 'Indexed' type
            if (
                isFieldDeclaration(member) &&
                member.type &&
                isNamedTypeNode(member.type) &&
                member.type.name.identifier.text === "Indexed"
            ) {
                // check that it has exactly one type parameter
                if (member.type.typeArguments === null || member.type.typeArguments.length > 1) {
                    parser.error(
                        DiagnosticCode.Transform_0_1,
                        member.range,
                        "stylus-sdk-as",
                        "`Indexed` must have exactly one type parameter."
                    );
                    continue;
                }

                // replace the Indexed<T> with its single type argument T
                member.type = member.type.typeArguments[0];

                if (indexedCount === 3) {
                    parser.error(
                        DiagnosticCode.Transform_0_1,
                        member.range,
                        "stylus-sdk-as",
                        "Cannot have more than 3 `Indexed` fields."
                    );
                    continue;
                }

                this.indexed.add(member);
                indexedCount += 1;
            }
        }

        // add a serialize function whose body will be generated later
        members.push(SimpleParser.parseClassMember(`serialize(): StaticArray<u8> {}`, event));
    }

    afterParse(parser: Parser) {
        for (const src of parser.sources) {
            if (src.isLibrary) continue;

            for (let i = 0; i < src.statements.length; ++i) {
                const stmt = src.statements[i];

                if (isImportStatement(stmt)) {
                    if (this.libInternalPath === null) {
                        throw new Error("libInternalPath is null");
                    }

                    // TODO: handle multiple instances of this
                    if (stmt.internalPath == this.libInternalPath) {
                        // TODO: split up transforms

                        let imports: ImportStatement[] = [];

                        let libPath = stmt.path.value;
                        if (path.basename(libPath).startsWith("index")) {
                            libPath = path.join(libPath, "..");
                        }

                        if (stmt.declarations === null) {
                            parser.error(
                                DiagnosticCode.Transform_0_1,
                                stmt.range,
                                "stylus-sdk-as",
                                "Asterisk imports of the library are not allowed."
                            );
                        } else {
                            for (const decl of stmt.declarations) {
                                if (decl.foreignName.text !== decl.name.text) {
                                    parser.error(
                                        DiagnosticCode.Transform_0_1,
                                        decl.range,
                                        "stylus-sdk-as",
                                        "Aliasing imports of the library are not allowed."
                                    );
                                }

                                // TODO: check if these were already imported
                                if (decl.name.text === "Event") {
                                    let eventPath;
                                    if (libPath == ".") {
                                        eventPath = "./" + path.join(libPath, "Event");
                                    } else {
                                        eventPath = path.join(libPath, "Event");
                                    }

                                    imports.push(
                                        Node.createImportStatement(
                                            [Node.createImportDeclaration(decl.foreignName, null, decl.range)],
                                            Node.createStringLiteralExpression(eventPath, stmt.path.range),
                                            stmt.range
                                        )
                                    );
                                } else if (decl.name.text === "entrypoint") {
                                    let addressPath;
                                    if (libPath == ".") {
                                        addressPath = "./" + path.join(libPath, "Address");
                                    } else {
                                        addressPath = path.join(libPath, "Address");
                                    }

                                    imports.push(
                                        Node.createImportStatement(
                                            [
                                                Node.createImportDeclaration(
                                                    Node.createIdentifierExpression("Address", decl.foreignName.range),
                                                    null,
                                                    decl.range
                                                )
                                            ],
                                            Node.createStringLiteralExpression(addressPath, stmt.path.range),
                                            stmt.range
                                        )
                                    );
                                }
                            }
                        }

                        for (const newImport of imports) {
                            const internalPath = newImport.internalPath;
                            if (!parser.seenlog.has(internalPath)) {
                                parser.backlog.push(internalPath);
                            }
                        }

                        src.statements.splice(i, 1, ...imports);
                        i += imports.length - 1;
                    }
                    continue;
                }

                if (!isClassDeclaration(stmt)) continue;

                const extendsType = stmt.extendsType;
                if (extendsType && isTypeName(extendsType.name)) {
                    switch (extendsType.name.identifier.text) {
                        case "Contract": // extends Contract
                            stmt.extendsType = null;
                            this.contracts.add(stmt);
                            this.ensureContract(stmt);
                            break;

                        case "Event": // extends Event
                            this.events.add(stmt);
                            this.ensureEvent(parser, stmt, src);
                            break;
                    }
                }

                // check for @entrypoint
                if (!stmt.decorators) continue;
                for (const decorator of stmt.decorators) {
                    if (!isIdentifier(decorator.name) || decorator.name.text !== "entrypoint") continue;

                    if (!this.contracts.has(stmt)) {
                        parser.error(
                            DiagnosticCode.Transform_0_1,
                            decorator.range,
                            "stylus-sdk-as",
                            "Only contracts (classes that extend `Contract`) may be declared as an entrypoint."
                        );
                    }

                    if (this.entrypoint !== null) {
                        parser.error(
                            DiagnosticCode.Transform_0_1,
                            decorator.range,
                            "stylus-sdk-as",
                            "No more than one contract may be declared as an entrypoint."
                        );
                    }

                    this.entrypoint = stmt;
                }
            }
        }

        if (this.entrypoint === null) {
            parser.error(
                DiagnosticCode.Transform_0_1,
                null,
                "stylus-sdk-as",
                "Exactly one contract must be declared as an `@entrypoint`."
            );
        } else if (this.entrypoint.isGeneric) {
            parser.error(
                DiagnosticCode.Transform_0_1,
                this.entrypoint.range,
                "stylus-sdk-as",
                "Entrypoint contracts may not be generic since monomorphization may split them into multiple contracts."
            );
        }
    }

    afterInitialize() {
        // TODO: unhook
        const purityInference = new PurityInference(this.program);

        for (const event of this.events) {
            this.fillSerializeImpl(event);
        }

        this.createEntrypointRouter();
    }
    // beforeCompile(compiler: Compiler) {}

    fillSerializeImpl(event: ClassDeclaration) {
        const proto = this.program.elementsByDeclaration.get(event);
        if (proto === undefined || !isClassPrototype(proto) || proto.instanceMembers === null) return;

        const serialize = proto.instanceMembers.get("serialize");

        if (
            serialize === undefined ||
            !isFunctionPrototype(serialize) ||
            serialize.bodyNode === null ||
            !isBlock(serialize.bodyNode)
        )
            throw new Error("Event serialize not found");

        const abi = new ABI(this.program, event.range);
        let hrABIParams = [];

        const serializer = new Serializer(this.program, event.range, 33, []);

        let topicCount = 1;
        let signature = proto.name + "(";
        const instanceMembers = [...proto.instanceMembers.values()];
        let nonIndexed: [PropertyPrototype, Type][] = [];
        for (let i = 0; i < instanceMembers.length; ++i) {
            const member = instanceMembers[i];
            if (isPropertyPrototype(member) && member.fieldDeclaration) {
                if (i > 0) signature += ",";
                if (member.typeNode === null) {
                    this.program.error(
                        DiagnosticCode.Transform_0_1,
                        member.declaration.range,
                        "stylus-sdk-as",
                        "Type must be specified"
                    );
                    continue;
                }
                const type = this.program.resolver.resolveType(member.typeNode, null, member, null, ReportMode.Swallow);
                if (type === null) {
                    this.program.error(
                        DiagnosticCode.Transform_0_1,
                        member.declaration.range,
                        "stylus-sdk-as",
                        "Cannot serialize type"
                    );
                    continue;
                }
                const serNotSpaced = abi.visit(type, false);
                const serSpaced = abi.visit(type, true);
                if (serNotSpaced === null || serSpaced === null) {
                    // TODO: only do this once
                    this.program.error(
                        DiagnosticCode.Transform_0_1,
                        member.declaration.range,
                        "stylus-sdk-as",
                        "Cannot serialize type"
                    );
                    continue;
                }
                signature += serNotSpaced;
                if (this.indexed.has(member.fieldDeclaration)) {
                    hrABIParams.push(`${serSpaced} indexed ${member.name}`);
                    serializer.visit(type, "this." + member.name);
                    topicCount += 1;
                } else {
                    hrABIParams.push(`${serSpaced} ${member.name}`);
                    nonIndexed.push([member, type]);
                }
            }
        }

        for (const [property, type] of nonIndexed) {
            serializer.visit(type, "this." + property.name);
        }

        signature += ")";
        if (signature === null) return;
        const topic0 = id(signature).slice(2);

        function bswap(hex: string): string {
            const bytes = hex.match(/.{2}/g);
            return bytes!.reverse().join("");
        }

        serialize.bodyNode.statements.push(
            SimpleParser.parseStatement(`const arr = new StaticArray<u8>(${serializer.offset})`, event.range),
            SimpleParser.parseStatement(`const ptr = changetype<usize>(arr);`, event.range),
            SimpleParser.parseStatement(`i32.store8(ptr, ${topicCount}, 0);`, event.range),
            SimpleParser.parseStatement(`i64.store(ptr, 0x${bswap(topic0.slice(0, 16))}, 1);`, event.range),
            SimpleParser.parseStatement(`i64.store(ptr, 0x${bswap(topic0.slice(16, 32))}, 9);`, event.range),
            SimpleParser.parseStatement(`i64.store(ptr, 0x${bswap(topic0.slice(32, 48))}, 17);`, event.range),
            SimpleParser.parseStatement(`i64.store(ptr, 0x${bswap(topic0.slice(48, 64))}, 25);`, event.range),
            ...serializer.stmts,
            SimpleParser.parseStatement(`return arr;`, event.range)
        );

        const builder = new ASTBuilder();
        builder.visitBlockStatement(serialize.bodyNode);
        //console.log(builder.finish());

        this.abi.push(`event ${proto.name}(${hrABIParams.join(", ")})`);
    }

    createEntrypointRouter() {
        if (this.entrypoint === null) return;

        const entrypointProto = this.program.elementsByDeclaration.get(this.entrypoint);
        if (entrypointProto === undefined || !isClassPrototype(entrypointProto)) return;

        const entrypoint = this.program.resolver.resolveClass(entrypointProto, null);

        if (entrypoint === null || entrypoint.members === null) {
            return;
        }

        let userEntrypoint: FunctionPrototype | null = null;
        for (const elem of this.program.elementsByDeclaration.values()) {
            if (isFunctionPrototype(elem)) {
                if (elem.name === "user_entrypoint" && elem.is(CommonFlags.Export)) {
                    if (userEntrypoint) {
                        throw new Error("Multiple entrypoints found");
                    }
                    userEntrypoint = elem;
                }
            }
        }

        if (userEntrypoint === null || !isFunctionDeclaration(userEntrypoint.declaration)) {
            throw new Error("Entrypoint not found");
        }

        const userEntrypointBlock = userEntrypoint.declaration.body;
        if (userEntrypointBlock === null || !isBlock(userEntrypointBlock)) {
            throw new Error("Entrypoint not block");
        }

        const range = userEntrypoint.declaration.range;

        // add it to the scope
        const mangledEntrypointName = `${entrypoint.name}Entrypoint`;
        userEntrypoint.parent.add(mangledEntrypointName, entrypointProto);

        // instantiate the entrypoint
        userEntrypointBlock.statements.push(
            SimpleParser.parseStatement(
                `const _${entrypoint.name} = changetype<${mangledEntrypointName}>(__new(${entrypoint.nextMemoryOffset}, ${entrypoint.id}));`,
                range,
                false
            )
        );

        let ifStmt: IfStatement | null = null;
        let lastIf: IfStatement | null = null;
        for (const method of entrypoint.members.values()) {
            if (!isFunctionPrototype(method)) continue;
            if (method.declaration.name.kind === NodeKind.Constructor) continue;

            const range = method.declaration.range;
            const abi = new ABI(this.program, range);
            const serialized = abi.functionSelector(method);
            const hrSerialized = abi.hrABI(method);
            if (serialized === null || hrSerialized === null) continue;

            this.abi.push(hrSerialized);

            const functionSelector = id(serialized);
            const le =
                functionSelector.slice(8, 10) +
                functionSelector.slice(6, 8) +
                functionSelector.slice(4, 6) +
                functionSelector.slice(2, 4);
            const ifClause = <IfStatement>SimpleParser.parseStatement(`if (selector == 0x${le}) { }`, range, false);
            ifClause.ifTrue = this.createFunctionSelectorBranch(method, userEntrypoint, entrypointProto, false, range);

            if (lastIf !== null) {
                lastIf.ifFalse = ifClause;
                lastIf = ifClause;
            } else if (ifStmt !== null) {
                ifStmt.ifFalse = ifClause;
                lastIf = ifClause;
            } else {
                ifStmt = ifClause;
            }
        }

        if (ifStmt) {
            userEntrypointBlock.statements.push(ifStmt);
        }

        userEntrypointBlock.statements.push(SimpleParser.parseStatement(`return 0;`, range, false));

        const builder = new ASTBuilder();
        builder.visitBlockStatement(userEntrypointBlock);
        //console.log(builder.finish());
    }

    createFunctionSelectorBranch(
        method: FunctionPrototype,
        userEntrypoint: FunctionPrototype,
        entrypointProto: ClassPrototype,
        payable: boolean,
        range: Range
    ) {
        const stmts: Statement[] = [];

        if (!payable) {
            stmts.push(SimpleParser.parseStatement(`if (msg_value() != u256.Zero) { return 1; }`, range, false));
        }

        const type = this.program.resolver.resolveType(
            method.functionTypeNode.returnType,
            null,
            method,
            null,
            ReportMode.Swallow
        );

        const params: string[] = [];
        const deserializer = new Deserializer(this.program, range, 4, userEntrypoint.parent);
        for (let i = 0; i < method.functionTypeNode.parameters.length; ++i) {
            const param = method.functionTypeNode.parameters[i];

            const name = param.name.text;
            const type = this.program.resolver.resolveType(param.type, null, method, null, ReportMode.Swallow);
            if (type === null) {
                continue;
            }

            deserializer.visit(type, "const " + name);
            params.push(name);
        }

        if (deserializer.offset > 4) {
            stmts.push(SimpleParser.parseStatement(`assert(len == ${deserializer.offset});`, range));
            stmts.push(...deserializer.stmts);
        }

        const call = `_${entrypointProto.name}.${method.name}(${params.join(", ")})`;
        if (type && type.kind !== TypeKind.Void) {
            stmts.push(SimpleParser.parseStatement(`const _return = ${call}`, range, false));
            const serializer = new Serializer(this.program, range);
            serializer.visit(type, "_return");
            stmts.push(
                SimpleParser.parseStatement(
                    `const ptr = changetype<usize>(new StaticArray<u8>(${serializer.offset}));`,
                    range
                )
            );
            stmts.push(...serializer.stmts);
            stmts.push(SimpleParser.parseStatement(`HostIO.write_result(ptr, ${serializer.offset});`, range));
        } else {
            stmts.push(SimpleParser.parseStatement(call, range, false));
        }

        return Node.createBlockStatement(stmts, range);
    }

    afterCompile() {
        const module = this.program.module;
        this.redirectBuiltInStart(module);
        this.writeFile("abi", this.abi.join("\n"), this.baseDir);
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
