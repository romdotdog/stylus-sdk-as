type Address = import("./Address").Address;
type u256 = import("as-bignum").u256;

declare function entrypoint(c: Constructor): void;

declare abstract class Event {}

declare type Indexed<T> = T;

declare abstract class Contract {
    private _$_address: Address;
    get address(): Address;
    static fromAddress<T extends Contract>(this: T, address: Address): ExternalContract<T>;
}

declare const ExternalContract: new <T extends Contract>(address: Address) => ExternalContract<T>;
declare type ExternalContract<T extends Contract> = { get address(): Address } & ExternalContractMethods<T>;

type AddValue<T> = T extends (...args: infer Args) => infer R ? (...args: [...Args, value?: number]) => R : never;
type AddGas<T> = T extends (...args: infer Args) => infer R ? (...args: [...Args, gas?: number]) => R : never;

type MethodNames<T> = {
    [K in keyof T]: T[K] extends (...args: any[]) => any ? K : never;
}[keyof T];

type ExternalContractMethods<T> = ExternalContractMethodsValue<T> & ExternalContractMethodsStatic<T>;

type ExternalContractMethodsValue<T> = {
    [K in MethodNames<T> as `${string & K}Basic` | `${string & K}Delegate`]: AddGas<AddValue<T[K]>>;
};

type ExternalContractMethodsStatic<T> = {
    [K in MethodNames<T> as `${string & K}Static`]: AddGas<T[K]>;
};
