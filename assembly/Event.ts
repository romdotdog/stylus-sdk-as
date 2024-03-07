export abstract class Event {
    abstract serialize(): StaticArray<u8>;
}
