export abstract class Event {
    abstract serialize(): StaticArray<u8>;
}

// @unmanaged
export abstract class Contract {}

export function entrypoint(): void {}