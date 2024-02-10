import { Transform } from "assemblyscript/dist/transform.js";
import {
    Parser,
    Module,
    DiagnosticCode,
    ElementKind,
    ClassPrototype,
    DeclaredElement,
    Expression,
    IdentifierExpression,
    NodeKind,
    Statement,
    ClassDeclaration,
    MethodDeclaration,
    Compiler,
    TypeName,
    Program,
    FunctionPrototype,
    CommonFlags,
    FunctionDeclaration,
    BlockStatement,
    Node,
    Token,
    IfStatement,
    FieldDeclaration
} from "assemblyscript/dist/assemblyscript.js";
import binaryenModule from "types:assemblyscript/src/glue/binaryen";
import lamearyen from "binaryen";
import { id } from "ethers";
import { Range } from "types:assemblyscript/src/diagnostics";
import { SimpleParser } from "./SimpleParser.js";

// make lamearyen not lame
const binaryen = lamearyen as unknown as typeof binaryenModule;

function isClassPrototype(elem: DeclaredElement): elem is ClassPrototype {
    return elem.kind === ElementKind.ClassPrototype;
}

function isClassDeclaration(stmt: Statement): stmt is ClassDeclaration {
    return stmt.kind === NodeKind.ClassDeclaration;
}

function isMethodDeclaration(stmt: Statement): stmt is MethodDeclaration {
    return stmt.kind === NodeKind.MethodDeclaration;
}

function isFieldDeclaration(stmt: Statement): stmt is FieldDeclaration {
    return stmt.kind === NodeKind.FieldDeclaration;
}

function isFunctionPrototype(elem: DeclaredElement): elem is FunctionPrototype {
    return elem.kind === ElementKind.FunctionPrototype;
}

function isFunctionDeclaration(stmt: Statement): stmt is FunctionDeclaration {
    return stmt.kind === NodeKind.FunctionDeclaration;
}

function isBlock(stmt: Statement): stmt is BlockStatement {
    return stmt.kind === NodeKind.Block;
}

function isIdentifier(expr: Expression): expr is IdentifierExpression {
    return expr.kind === NodeKind.Identifier;
}

function isTypeName(expr: Expression): expr is TypeName {
    return expr.kind === NodeKind.TypeName;
}

export default class extends Transform {
    private entrypoint: ClassDeclaration | null = null;
    private contracts: Set<ClassDeclaration> = new Set();

    afterParse(parser: Parser) {
        for (const src of parser.sources) {
            if (src.isLibrary) continue;

            for (const stmt of src.statements) {
                if (isClassDeclaration(stmt)) {
                    const extendsType = stmt.extendsType;
                    if (extendsType) {
                        if (isTypeName(extendsType.name)) {
                            // TODO: ContractAnd<T>
                            if (extendsType.name.identifier.text === "Contract") {
                                this.contracts.add(stmt);
                                stmt.extendsType = null;
                            }
                        }
                    }

                    if (stmt.decorators) {
                        for (const decorator of stmt.decorators) {
                            if (isIdentifier(decorator.name) && decorator.name.text === "entrypoint") {
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

        for (const contract of this.contracts) {
            const field = SimpleParser.parseClassMember("private _$_address: Address | null;", contract);

            contract.members.push(field);

            const getter = SimpleParser.parseClassMember(
                "public get address(): Address { return this._$_address == null ? (this._$_address = contract_address()) : this._$_address!; }",
                contract
            );

            contract.members.push(getter);
        }
    }

    afterInitialize(program: Program) {
        if (this.entrypoint === null) return;

        const entrypointProto = this.program.elementsByDeclaration.get(this.entrypoint);
        if (
            entrypointProto === undefined ||
            !isClassPrototype(entrypointProto) ||
            entrypointProto.instanceMembers === null
        )
            return;

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
            SimpleParser.parseStatement(`const _${entrypointProto.name} = new ${entrypointProto.name}();`, range, false)
        );

        let ifStmt: IfStatement | null = null;
        for (const method of entrypointProto.instanceMembers.values()) {
            if (!isFunctionPrototype(method)) continue;
            const functionSelector = id(`${method.name}()`);
            const le =
                functionSelector.slice(8, 10) +
                functionSelector.slice(6, 8) +
                functionSelector.slice(4, 6) +
                functionSelector.slice(2, 4);
            const range = method.declaration.range;
            const ifClause = <IfStatement>SimpleParser.parseStatement(`if (selector == 0x${le}) { }`, range, false);
            ifClause.ifTrue = createFunctionSelectorBranch(method, entrypointProto, false, range);

            if (ifStmt === null) {
                ifStmt = ifClause;
            } else {
                ifStmt.ifFalse = ifClause;
            }
        }

        if (ifStmt) {
            userEntrypointBlock.statements.push(ifStmt);
        }

        userEntrypointBlock.statements.push(SimpleParser.parseStatement(`return 0;`, range, false));

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
}

function createFunctionSelectorBranch(
    method: FunctionPrototype,
    entrypointProto: ClassPrototype,
    payable: boolean,
    range: Range
) {
    const stmts: Statement[] = [];
    range.source;

    if (!payable) {
        stmts.push(SimpleParser.parseStatement(`if (msg_value() != u256.Zero) { return 1; }`, range, false));
    }

    stmts.push(SimpleParser.parseStatement(`_start();`, range, false));
    stmts.push(SimpleParser.parseStatement(`_${entrypointProto.name}.${method.name}()`, range, false));

    return Node.createBlockStatement(stmts, range);
}
