import { Address } from "../assembly/Address";
import { Contract, entrypoint } from "../assembly/index";

import { u256 } from "as-bignum/assembly/index";

class ExampleStruct {
    foo: u256;
    bar: bool;
    baz: Address;
}

class StringStruct {
    val: string;
}

class StringDPayload {
    a: string;
    b: StringStruct;
}

@entrypoint
export class Serde extends Contract {
    u256(n: u256): u256 {
        // @ts-ignore
        return n + u256.One;
    }

    // TODO: put the underscores back to test reserved keywords
    _address(_address: Address): Address {
        const address2 = new Address(_address.lo1, _address.lo2, _address.hi1);
        
        address2.switchEndian();
        address2.switchEndian();

        assert(address2.lo1 == _address.lo1 && address2.lo2 == _address.lo2 && address2.hi1 == _address.hi1);

        //assert(address2.lo1 != 0 && address2.lo2 != 0 && address2.hi1 != 0);
        return address2;
    }

    _addressp1(_address: Address): Address {
        _address.lo1 += 1;
        return _address;
    }

    _struct(_struct: ExampleStruct): ExampleStruct {
        // @ts-ignore
        _struct.foo += u256.One;
        _struct.bar = !_struct.bar;
        return _struct;
    }

    _boolean(b: boolean): boolean {
        return !b;
    }

    _bool(b: bool): bool {
        return !b;
    }

    i8(i: i8): i8 {
        return i + 1;
    }

    u8(u: u8): u8 {
        return u + 1;
    }

    i16(i: i16): i16 {
        return i + 1;
    }

    u16(u: u16): u16 {
        return u + 1;
    }

    i32(i: i32): i32 {
        return i + 1;
    }

    u32(u: u32): u32 {
        return u + 1;
    }

    i64(i: i64): i64 {
        return i + 1;
    }

    u64(u: u64): u64 {
        return u + 1;
    }

    isize(i: isize): isize {
        return i + 1;
    }

    usize(u: usize): usize {
        return u + 1;
    }

    _string(s: string): string {
        return s + "1";
    }

    _dynamicStruct(s: string, s2: StringStruct): StringDPayload {
        return { a: s, b: s2 };
    }
}
