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
    // function number() external view returns (uint256)
    number(): u256 {
        return load_bytes32(u256.Zero);
    }

    // function setNumber(uint256 n) external
    setNumber(n: u256): void {
        store_bytes32(u256.Zero, n);
    }

    // function increment() external
    increment(): void {
        let n = load_bytes32(u256.Zero);
        // @ts-ignore
        ++n;
        store_bytes32(u256.Zero, n);
    }

    // function thisAddress() external view returns (address)
    thisAddress(): Address {
        return this.address;
    }
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
