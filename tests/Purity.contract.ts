import { Contract, Event, Indexed } from "../assembly/index";
import { load_bytes32, store_bytes32 } from "../assembly/util";

import { u256 } from "as-bignum/assembly/index";

export class Purity extends Contract {
    basicPure(): u32 {
        return 0;
    }

    basicView(): u256 {
        return load_bytes32(u256.Zero);
    }

    basicImpure(): void {
        store_bytes32(u256.Zero, u256.Zero);
    }

    _pure(): u32 {
        return foo((): u32 => 0);
    }

    _view(): u256 {
        return foo((): u256 => load_bytes32(u256.Zero));
    }

    _impure(): void {
        foo<void>((): void => {
            store_bytes32(u256.Zero, u256.Zero);
        });
    }

    pureComplex(): u32 {
        return fooComplex([(): u32 => 0]);
    }

    viewComplex(): u256 {
        return fooComplex([(): u256 => load_bytes32(u256.Zero)]);
    }

    impureComplex(): void {
        fooComplex<void>([
            (): void => {
                store_bytes32(u256.Zero, u256.Zero);
            }
        ]);
    }

    overwritePure(): u32 {
        let f = (): u32 => 0;
        f = (): u32 => 0;
        return foo(f);
    }

    overwriteView(): u256 {
        let f = (): u256 => u256.Zero;
        f = (): u256 => load_bytes32(u256.Zero);
        return foo(f);
    }

    overwriteImpure(): void {
        let f = (): void => {};
        f = (): void => {
            store_bytes32(u256.Zero, u256.Zero);
        };
        foo<void>(f);
    }

    nestedFunctionPure(): u32 {
        return foo((): u32 => foo((): u32 => 0));
    }

    nestedFunctionView(): u256 {
        return foo((): u256 => foo((): u256 => load_bytes32(u256.Zero)));
    }

    nestedFunctionImpure(): void {
        foo<void>((): void => {
            foo<void>((): void => {
                store_bytes32(u256.Zero, u256.Zero);
            });
        });
    }

    impureAdvanced(): void {
        const f = ((): u32 => 0).index;
        call_indirect(f); // default to impure
    }

    // TODO: can we directly cast a function index to a function type?

    pureAdvanced(): void {
        const c: C = { f: (): void => {} };
        foo2<C, void>((c: C) => {
            c.f();
        }, c);
    }

    impureAdvanced2(): void {
        const c: C = {
            f: (): void => {
                store_bytes32(u256.Zero, u256.Zero);
            }
        };
        foo2<C, void>((c: C) => {
            c.f();
        }, c);
    }

    impureAdvanced3(): void {
        const c: C2 = {
            f: (): void => {
                store_bytes32(u256.Zero, u256.Zero);
            },
            c: null
        };
        foo2<C2, void>((c: C2) => {
            c.f();
        }, c);
    }
}

class C {
    f: () => void;
}

// recursive classes are more difficult
// because they represent a possibly infinite
// number of paths/types
class C2 {
    f: () => void;

    // do not recurse into this for the analysis
    c: C2 | null;
}

function foo<T>(f: () => T): T {
    return f();
}

function fooComplex<T>(fs: (() => T)[]): T {
    return fs[0]();
}

function foo2<P, R>(f: (p: P) => R, p: P): R {
    return f(p);
}
