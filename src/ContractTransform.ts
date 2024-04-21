import {
    Type,
    ASTBuilder,
    ClassDeclaration,
    ClassPrototype,
    CommonFlags,
    DiagnosticCode,
    FunctionPrototype,
    IfStatement,
    NodeKind,
    Program,
    Range,
    ReportMode,
    Statement,
    TypeKind,
    Node,
    Parser,
    Element,
    BlockStatement
} from "assemblyscript/dist/assemblyscript.js";
import {
    isBlock,
    isClassPrototype,
    isFieldDeclaration,
    isFunctionDeclaration,
    isFunctionPrototype,
    isMethodDeclaration
} from "./util.js";
import { SimpleParser } from "./SimpleParser.js";
import { id } from "ethers";
import { ABI } from "./ABI.js";
import { Deserializer } from "./Deserializer.js";
import { Serializer } from "./Serializer.js";

export class ContractTransform {
    private contracts: Set<ClassDeclaration> = new Set();
    private entrypoint: ClassDeclaration | null = null;

    constructor(public program: Program, private abi: string[]) {}

    add(parser: Parser, contract: ClassDeclaration) {
        const members = contract.members;
        for (let i = 0; i < members.length; ++i) {
            const member = members[i];

            // if it's a constructor declaration
            if (isMethodDeclaration(member) && member.name.kind === NodeKind.Constructor) {
                parser.error(
                    DiagnosticCode.Transform_0_1,
                    contract.range,
                    "stylus-sdk-as",
                    "Contracts may not have a user-defined constructor."
                );

                members.splice(i, 1);
                i--;
            } else if (isFieldDeclaration(member)) {
                parser.error(
                    DiagnosticCode.Transform_0_1,
                    contract.range,
                    "stylus-sdk-as",
                    "Contracts may only have fields whose type is `Storage<T>`."
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

        contract.extendsType = null;
        this.contracts.add(contract);
    }

    trySetEntrypoint(parser: Parser, _class: ClassDeclaration, reportRange: Range) {
        if (!this.contracts.has(_class)) {
            parser.error(
                DiagnosticCode.Transform_0_1,
                reportRange,
                "stylus-sdk-as",
                "Only contracts (classes that extend `Contract`) may be declared as an entrypoint."
            );
        }

        if (this.entrypoint !== null) {
            parser.error(
                DiagnosticCode.Transform_0_1,
                reportRange,
                "stylus-sdk-as",
                "No more than one contract may be declared as an entrypoint."
            );
        }

        if (_class.isGeneric) {
            return parser.error(
                DiagnosticCode.Transform_0_1,
                reportRange,
                "stylus-sdk-as",
                "Entrypoint contracts may not be generic since monomorphization may split them into multiple contracts."
            );
        }

        this.entrypoint = _class;
    }

    createEntrypointRouter() {
        if (this.entrypoint === null) {
            return this.program.error(
                DiagnosticCode.Transform_0_1,
                null,
                "stylus-sdk-as",
                "Exactly one contract must be declared as an `@entrypoint`."
            );
        }

        const entrypointProto = this.program.elementsByDeclaration.get(this.entrypoint);
        if (entrypointProto === undefined || !isClassPrototype(entrypointProto)) return;

        const entrypoint = this.program.resolver.resolveClass(entrypointProto, null);
        if (entrypoint === null || entrypoint.members === null) return;

        // find `user_entrypoint`
        let userEntrypoint = this.getUserEntrypoint();
        if (!isFunctionDeclaration(userEntrypoint.declaration)) {
            throw new Error("Entrypoint not found");
        }

        const range = userEntrypoint.declaration.range;
        const userEntrypointBlock = userEntrypoint.declaration.body;
        if (userEntrypointBlock === null || !isBlock(userEntrypointBlock)) {
            throw new Error("Entrypoint not block");
        }

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

        // the root if statement
        let ifStmt: IfStatement | null = null;
        // the last `if` or `else if` branch
        let lastIf: IfStatement | null = null;

        for (const method of entrypoint.members.values()) {
            if (!isFunctionPrototype(method)) continue;
            if (method.declaration.name.kind === NodeKind.Constructor) continue;

            const range = method.declaration.range;

            // generate function selector and abi
            const abiSerializer = new ABI(this.program, range);
            const functionSelectorText = abiSerializer.functionSelector(method);
            const abi = abiSerializer.hrABI(method);
            if (functionSelectorText === null || abi === null) continue;

            this.abi.push(abi);

            const functionSelector = id(functionSelectorText);
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
        console.log(builder.finish());
    }

    private getUserEntrypoint() {
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

        if (userEntrypoint === null) {
            throw new Error("Entrypoint not found");
        }

        return userEntrypoint;
    }

    private createFunctionSelectorBranch(
        method: FunctionPrototype,
        userEntrypoint: FunctionPrototype,
        entrypointProto: ClassPrototype,
        payable: boolean,
        range: Range
    ): BlockStatement {
        // statements of the branch
        const stmts: Statement[] = [];

        console.log("Creating function selector branch for", method.name);

        if (!payable) {
            stmts.push(SimpleParser.parseStatement(`if (msg_value() != u256.Zero) { return 1; }`, range, false));
        }

        // resolve the return type
        const type = this.program.resolver.resolveType(
            method.functionTypeNode.returnType,
            null,
            method,
            null,
            ReportMode.Swallow
        );

        this.deserializeParams(stmts, method, userEntrypoint.parent, range);

        const params = method.functionTypeNode.parameters.map(param => param.name.text);

        if (type && type.kind !== TypeKind.Void) {
            stmts.push(
                SimpleParser.parseStatement(
                    `const _return = _${entrypointProto.name}.${method.name}(${params.join(", ")})`,
                    range,
                    false
                )
            );

            this.serializeReturn(stmts, type, range);
        } else {
            stmts.push(
                SimpleParser.parseStatement(
                    `_${entrypointProto.name}.${method.name}(${params.join(", ")})`,
                    range,
                    false
                )
            );
        }

        return Node.createBlockStatement(stmts, range);
    }

    private deserializeParams(stmts: Statement[], method: FunctionPrototype, ctxElement: Element, range: Range) {
        const deserializer = new Deserializer(this.program, range, 4, ctxElement, stmts);
        for (let i = 0; i < method.functionTypeNode.parameters.length; ++i) {
            const param = method.functionTypeNode.parameters[i];

            const name = param.name.text;
            const type = this.program.resolver.resolveType(param.type, null, method, null, ReportMode.Swallow);
            if (type === null) {
                continue;
            }

            deserializer.visit(type, "const " + name);
        }

        deserializer.visitDynamic();

        // we put the assert after deserialization because the dynamic sizes are not known before
        stmts.push(SimpleParser.parseStatement(`assert(len == ${deserializer.size});`, range));
    }

    private serializeReturn(stmts: Statement[], type: Type, range: Range) {
        const serializer = new Serializer(this.program, range);
        serializer.inlineStruct = true;
        serializer.visit(type, "_return");
        serializer.visitDynamic();
        stmts.push(...serializer.dynamicSizeStmts);
        stmts.push(
            SimpleParser.parseStatement(
                `let startPtr = changetype<usize>(new StaticArray<u8>(${serializer.maxSize}));`,
                range
            ),
            SimpleParser.parseStatement(`let ptr = startPtr, structPtr = startPtr;`, range)
        );
        stmts.push(...serializer.stmts);
        stmts.push(SimpleParser.parseStatement(`HostIO.write_result(startPtr, ${serializer.size});`, range));
    }
}
