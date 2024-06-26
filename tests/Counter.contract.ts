import { Contract, Event, Indexed } from "../assembly/index";

import { u256 } from "as-bignum/assembly/index";
import { load_bytes32, store_bytes32, contract_address, emit } from "../assembly/util";
import { Address } from "../assembly/Address";

// event NumberChanged(uint256 indexed n)
class NumberChanged extends Event {
    n: Indexed<u256>;
}

export class Counter extends Contract {
    // function number() external view returns (uint256)
    number(): u256 {
        return load_bytes32(u256.Zero);
    }

    // function setNumber(uint256 n) external
    setNumber(n: u256): void {
        store_bytes32(u256.Zero, n);
        emit<NumberChanged>({ n });
    }

    // function increment() external
    increment(): void {
        let n = load_bytes32(u256.Zero);
        // @ts-ignore
        ++n;
        store_bytes32(u256.Zero, n);
        emit<NumberChanged>({ n });
    }

    // function thisAddress() external view returns (address)
    thisAddress(): Address {
        return contract_address();
    }
}
