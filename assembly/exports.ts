export abstract class Event {
    abstract serialize(): StaticArray<u8>;
}

export abstract class Contract {}

export type Indexed<T> = T;