export abstract class Event {
    abstract serialize(): StaticArray<u8>;
}

export abstract class Contract {}

export function entrypoint(): void {}

export type Indexed<T> = T;