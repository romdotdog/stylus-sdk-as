import { u256 } from "as-bignum/assembly";
import { HostIO } from "./hostio";
import { load_bytes32, output, store_bytes32, args, msg_value, contract_address } from "./util";
import { Address } from "./Address";

export function mark_used(): void {
    HostIO.memory_grow(0);
    assert(false);
}

// @ts-ignore
export function user_entrypoint(len: usize): usize {
    if (HostIO.msg_reentrant()) {
        return 1;
    }

    const input = args(len);
    const inputPtr = changetype<usize>(input);
    const selector = i32.load(inputPtr);

    // function will be completed by transform
}

function _start(): void {}
