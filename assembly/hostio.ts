export declare namespace HostIO {
    // @ts-ignore
    @external("vm_hooks", "contract_address")
    export function contract_address(address: usize): void;

    // @ts-ignore
    @external("vm_hooks", "msg_reentrant")
    export function msg_reentrant(): bool;

    // @ts-ignore
    @external("vm_hooks", "msg_value")
    export function msg_value(value: usize): void;

    // @ts-ignore
    @external("vm_hooks", "create1")
    export function create1(code: usize, codeLen: usize, endowment: usize, contract: usize, revertDataLen: usize): void;

    // @ts-ignore
    @external("vm_hooks", "read_args")
    export function read_args(dest: StaticArray<u8>): void;

    // @ts-ignore
    @external("vm_hooks", "emit_log")
    export function emit_log(data: usize, len: usize, topics: usize): void;

    // @ts-ignore
    @external("vm_hooks", "storage_load_bytes32")
    export function storage_load_bytes32(key: usize, dest: usize): void;

    // @ts-ignore
    @external("vm_hooks", "storage_store_bytes32")
    export function storage_store_bytes32(key: usize, value: usize): void;

    // @ts-ignore
    @external("vm_hooks", "write_result")
    export function write_result(data: usize, len: usize): void;

    // @ts-ignore
    @external("vm_hooks", "memory_grow")
    export function memory_grow(pages: u16): void;
    
}