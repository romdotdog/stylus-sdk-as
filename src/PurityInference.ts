// for details, look in purityinference.dl

import { Compiler, Function, Program, Type } from "assemblyscript/dist/assemblyscript.js";
import { hook } from "./util.js";

enum Purity {
    WriteRead, // impure
    Read, // view
    None // pure
}

interface FunctionFacts {
    literal: Literal;
    localLiterals: Map<Type, Literal>;
    facts: Implication[];
}

interface Literal {
    impure: number;
    view: number;
}

interface Implication {
    antecedent: number;
    consequent: number;
}

export class PurityInference {
    public functions: Map<Function, FunctionFacts> = new Map();
    public freeLiteral: number = 0;
    public functionFacts: FunctionFacts | undefined = undefined;
    public unhooks: (() => void)[] = [];

    constructor(public program: Program) {
        this.unhooks.push(
            hook(Compiler, "compileFunction", (compiler, raw, instance, forceStdAlternative) => {
                const prevFF = this.functionFacts;
                this.functionNoMemo(instance);
                const res = raw(instance, forceStdAlternative);
                this.functionFacts = prevFF;
                return res;
            })
        );
    }

    get facts(): Implication[] | undefined {
        return this.functionFacts?.facts;
    }

    private newLiteral(): Literal {
        const literal = {
            impure: this.freeLiteral++,
            view: this.freeLiteral++
        };

        // impure (write/read) implies view (read)
        this.facts!.push({
            antecedent: literal.impure,
            consequent: literal.view
        });

        return literal;
    }

    private initializeParam(type: Type) {
        const _class = type.getClassOrWrapper(this.program);

        if (_class === null) {
            return;
        }

        if (_class.prototype === this.program.functionPrototype) {
            const literal = this.newLiteral();
            this.functionFacts!.localLiterals.set(type, literal);
        } else {
            const tA = _class.typeArguments;
            if (tA !== null) {
                for (let i = 0; i < tA.length; i++) {
                    this.initializeParam(tA[i]);
                }
            }
        }
    }

    private functionNoMemo(f: Function): FunctionFacts {
        this.functionFacts = {
            literal: { impure: 0, view: 0 },
            localLiterals: new Map(),
            facts: []
        };

        this.functionFacts.literal = this.newLiteral();

        this.functions.set(f, this.functionFacts);

        // initialize function types in params as "generics"
        const params = f.signature.parameterTypes;
        for (let i = 0; i < params.length; i++) {
            this.initializeParam(params[i]);
        }

        return this.functionFacts;
    }

    public unhook() {
        for (const unhook of this.unhooks) {
            unhook();
        }
        this.unhooks = [];
    }
}
