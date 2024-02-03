import { u256 } from "as-bignum/assembly";
import { HostIO } from "./hostio";

const incrementSelector = memory.data<u8>([0xd0, 0x9d, 0xe0, 0x8a]);
const numberSelector = memory.data<u8>([0x83, 0x81, 0xf5, 0x8a]);

export function mark_used(): void {
    HostIO.memory_grow(0);
    assert(false);
}

export function user_entrypoint(len: usize): usize {
    if (HostIO.msg_reentrant()) {
        return 1;
    }
    const input = args(len);
    assert(input.length >= 4);
    const selectorPtr = changetype<usize>(input);
    if (i32.load(selectorPtr) == i32.load(incrementSelector)) {
        let n = load_bytes32(u256.Zero);
        // @ts-ignore
        ++n;
        store_bytes32(u256.Zero, n);
    } else if (i32.load(selectorPtr) == i32.load(numberSelector)) {
        let n = load_bytes32(u256.Zero);
        output(n);
    }

    return 0;
}

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

function load_bytes32(key: u256): u256 {
    storeU256BE(buffer1, key);
    HostIO.storage_load_bytes32(changetype<usize>(buffer1), changetype<usize>(buffer2));
    return loadU256BE(buffer2);
}

function store_bytes32(key: u256, value: u256): void {
    storeU256BE(buffer1, key);
    storeU256BE(buffer2, value);
    HostIO.storage_store_bytes32(changetype<usize>(buffer1), changetype<usize>(buffer2));
}

function output(value: u256): void {
    storeU256BE(buffer1, value);
    HostIO.write_result(changetype<usize>(buffer1), 32);
}

function args(len: usize): StaticArray<u8> {
    const args = new StaticArray<u8>(len);
    HostIO.read_args(args);
    return args;
}

function abort(message: usize, fileName: usize, line: u32, column: u32): void {
    return;
}
