import { u256 } from "as-bignum/assembly";
import { HostIO } from "./hostio";
import { load_bytes32, output, store_bytes32, args, msg_value, contract_address } from "./util";
import { Address } from "./Address";

export function mark_used(): void {
    HostIO.memory_grow(0);
    assert(false);
}

@entrypoint
class Counter extends Contract {
    number(): void {
        let n = load_bytes32(u256.Zero);
        output(n);
    }

    increment(): void {
        let n = load_bytes32(u256.Zero);
        // @ts-ignore
        ++n;
        store_bytes32(u256.Zero, n);
    }
}

// @ts-ignore
export function user_entrypoint(len: usize): usize {
    if (HostIO.msg_reentrant()) {
        return 1;
    }

    const input = args(len);
    assert(input.length >= 4);
    const selector = i32.load(changetype<usize>(input));

    // function will be completed by transform
}

function _start(): void {}
