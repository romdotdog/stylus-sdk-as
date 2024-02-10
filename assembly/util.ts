import { u256 } from "as-bignum/assembly";
import { HostIO } from "./hostio";
import { Address } from "./Address";

const buffer1 = memory.data(32);
const buffer2 = memory.data(32);

function loadU256BE(buffer: usize): u256 {
    const data = u256.Zero;
    data.hi2 = bswap<u64>(i64.load(buffer, 0));
    data.hi1 = bswap<u64>(i64.load(buffer, 8));
    data.lo2 = bswap<u64>(i64.load(buffer, 16));
    data.lo1 = bswap<u64>(i64.load(buffer, 24));
    return data;
}

function storeU256BE(buffer: usize, value: u256): void {
    i64.store(buffer, bswap<u64>(value.hi2), 0);
    i64.store(buffer, bswap<u64>(value.hi1), 8);
    i64.store(buffer, bswap<u64>(value.lo2), 16);
    i64.store(buffer, bswap<u64>(value.lo1), 24);
}

export function msg_value(): u256 {
    HostIO.msg_value(changetype<usize>(buffer1));
    return loadU256BE(buffer1);
}

export function load_bytes32(key: u256): u256 {
    storeU256BE(buffer1, key);
    const data = u256.Zero;
    HostIO.storage_load_bytes32(changetype<usize>(buffer1), changetype<usize>(data));
    return data;
}

export function store_bytes32(key: u256, value: u256): void {
    storeU256BE(buffer1, key);
    HostIO.storage_store_bytes32(changetype<usize>(buffer1), changetype<usize>(value));
}

export function output(value: u256): void {
    storeU256BE(buffer1, value);
    HostIO.write_result(changetype<usize>(buffer1), 32);
}

export function args(len: usize): StaticArray<u8> {
    const args = new StaticArray<u8>(len);
    HostIO.read_args(args);
    return args;
}

export function contract_address(): Address {
    const address = Address.Zero;
    HostIO.contract_address(changetype<usize>(address));
    address.switchEndian();
    return address;
}

// @ts-ignore
@lazy
let RETURN_DATA_LEN = 0;

export namespace Contract {
    function deploy(code: Uint8Array, endowment: u256): Address | null {
        // TODO: cache policy

        storeU256BE(buffer1, endowment);
        const contract = Address.Zero;
        const revertDataLen = heap.alloc(sizeof<usize>());

        HostIO.create1(code.dataStart, code.byteLength, buffer1, changetype<usize>(contract), revertDataLen);

        if (contract.isZero()) {
            RETURN_DATA_LEN = load<usize>(revertDataLen);
            return null;
        }

        contract.switchEndian();
        return contract;
    }
}
