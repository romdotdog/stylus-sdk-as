// do not remove these imports
import { u256 } from "as-bignum/assembly";
import { HostIO } from "./hostio";
import { msg_value, align32 } from "./util";
import { Address } from "./Address";
// do not remove these imports

export function mark_used(): void {
    HostIO.pay_for_memory_grow(0);
    assert(false);
}

// @ts-ignore
export function user_entrypoint(len: usize): usize {
    if (HostIO.msg_reentrant()) {
        return 1;
    }

    gc_start();

    const lenI32 = <i32>len;
    assert(lenI32 >= 4);
    const input = new StaticArray<u8>(lenI32);
    HostIO.read_args(input);

    let inputPtr = changetype<usize>(input);
    const selector = i32.load(inputPtr);

    // function will be completed by transform
}

export function gc_start(): void {}
