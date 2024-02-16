import { Transform } from "assemblyscript/dist/transform.js";
import {
    Parser,
    Module,
    DiagnosticCode,
    ClassPrototype,
    Statement,
    ClassDeclaration,
    Compiler,
    Program,
    FunctionPrototype,
    CommonFlags,
    Node,
    IfStatement,
    Type,
    ReportMode,
    TypeKind,
    CommonNames,
    ASTBuilder,
    Source,
    SourceKind,
    MethodDeclaration,
    NodeKind
} from "assemblyscript";
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
    isMethodDeclaration
} from "./guards.js";
import { Deserializer } from "./Deserializer.js";
import { Serializer } from "./Serializer.js";
import { ABI } from "./ABI.js";

// make lamearyen not lame
const binaryen = lamearyen as unknown as typeof binaryenModule;

export default class extends Transform {
    private entrypoint: ClassDeclaration | null = null;
    private contracts: Set<ClassDeclaration> = new Set();

    ensureContract(contract: ClassDeclaration) {
        const members = contract.members;
        for (let i = 0; i < members.length; ++i) {
            const member = members[i];
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
            SimpleParser.parseClassMember(
                `constructor() { ERROR("Do not instantiate contracts directly."); }`,
                contract
            )
        );

        members.push(SimpleParser.parseClassMember(`private _$_address: Address | null = null;`, contract));

        members.push(
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

    afterParse(parser: Parser) {
        for (const src of parser.sources) {
            if (src.isLibrary) continue;

            for (const stmt of src.statements) {
                if (!isClassDeclaration(stmt)) continue;
                const extendsType = stmt.extendsType;
                if (extendsType && isTypeName(extendsType.name) && extendsType.name.identifier.text === "Contract") {
                    this.contracts.add(stmt);
                    stmt.extendsType = null;
                    this.ensureContract(stmt);
                }

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

        // instantiate the entrypoint
        userEntrypointBlock.statements.push(
            SimpleParser.parseStatement(
                `const _${entrypoint.name} = changetype<${entrypoint.name}>(__new(${entrypoint.nextMemoryOffset}, ${entrypoint.id}));`,
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
            const serialized = new ABI(this.program, range).functionSelector(method);
            if (serialized === null) continue;
            const functionSelector = id(serialized);
            const le =
                functionSelector.slice(8, 10) +
                functionSelector.slice(6, 8) +
                functionSelector.slice(4, 6) +
                functionSelector.slice(2, 4);
            const ifClause = <IfStatement>SimpleParser.parseStatement(`if (selector == 0x${le}) { }`, range, false);
            ifClause.ifTrue = this.createFunctionSelectorBranch(method, entrypointProto, false, range);

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
        console.log(builder.finish());

        // hook into compiler
        const transform = this;
        const oldCompile = Compiler.prototype.compile;
        Compiler.prototype.compile = function (this: Compiler) {
            if (this.program === transform.program) {
                transform.beforeCompile.call(transform, this);
            }
            return oldCompile.call(this);
        };
    }

    beforeCompile(compiler: Compiler) {}

    afterCompile() {
        const module = this.program.module;
        this.redirectBuiltInStart(module);
    }

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
        let cStr = module.allocStringCached("assembly/index/_start");
        let params = binaryen._BinaryenFunctionGetParams(start);
        let results = binaryen._BinaryenFunctionGetResults(start);
        let body = binaryen._BinaryenFunctionGetBody(start);
        let newFuncRef = binaryen._BinaryenAddFunction(module.ref, cStr, params, results, 0, 0, body);
        if (this.program.options.sourceMap || this.program.options.debugInfo) {
            let func = this.program.searchFunctionByRef(newFuncRef);
            if (func) func.addDebugInfo(module, newFuncRef);
        }

        module.setStart(0);
        module.removeFunction("~start");
    }

    createFunctionSelectorBranch(
        method: FunctionPrototype,
        entrypointProto: ClassPrototype,
        payable: boolean,
        range: Range
    ) {
        const stmts: Statement[] = [];

        if (!payable) {
            stmts.push(SimpleParser.parseStatement(`if (msg_value() != u256.Zero) { return 1; }`, range, false));
        }

        stmts.push(SimpleParser.parseStatement(`_start();`, range, false));

        const type = this.program.resolver.resolveType(
            method.functionTypeNode.returnType,
            null,
            method,
            null,
            ReportMode.Swallow
        );

        const params: string[] = [];
        const deserializer = new Deserializer(this.program, range, 4);
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
            stmts.push(SimpleParser.parseStatement(`assert(input.length >= ${deserializer.offset});`, range));
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

    abi(type: Type, range: Range): string {
        if (type.isValue) {
            switch (type.kind) {
                case TypeKind.I8:
                    return "int8";
                case TypeKind.U8:
                    return "uint8";
                case TypeKind.I16:
                    return "int16";
                case TypeKind.U16:
                    return "uint16";
                case TypeKind.I32:
                    return "int32";
                case TypeKind.U32:
                    return "uint32";
                case TypeKind.I64:
                    return "int64";
                case TypeKind.U64:
                    return "uint64";
                case TypeKind.Isize:
                    return this.program.options.isWasm64 ? "int64" : "int32";
                case TypeKind.Usize:
                    return this.program.options.isWasm64 ? "uint64" : "uint32";
            }
        } else if (type.isClass) {
            const _class = type.getClass();
            if (_class !== null && _class.members !== null) {
                if (_class.name === "u256") {
                    return "uint256";
                }

                const hasPointers = _class.members.has(CommonNames.visit);
                if (!hasPointers) {
                }
            }
        }
        this.program.error(DiagnosticCode.Transform_0_1, range, "stylus-sdk-as", "Cannot serialize type");
        return "pointer";
    }
}
