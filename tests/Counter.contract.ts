import { Contract, Event, Indexed, entrypoint } from "../assembly/index";

import { u256 } from "as-bignum/assembly/index";
import { load_bytes32, output, store_bytes32, args, msg_value, contract_address, emit } from "../assembly/util";
import { HostIO } from "../assembly/hostio";
import { Address } from "../assembly/Address";

// event NumberChanged(uint256 indexed n)
class NumberChanged extends Event {
    n: Indexed<u256>;
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
