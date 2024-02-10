type Address = import("./Address").Address;
type u256 = import("as-bignum").u256;

declare function entrypoint(c: Constructor): void;

interface GetAddress {
    get address(): Address;
}

declare abstract class Contract implements GetAddress {
    private _$_address: Address;
    get address(): Address;
    static fromAddress<T extends Contract>(this: T, address: Address): ExternalContract<T>;
}

declare const ContractAnd: {
    new <T extends Contract>(data: T): ContractAnd<T>;
} & typeof Contract;
declare type ContractAnd<T extends Contract> = T;

declare const ExternalContract: new <T extends Contract>(address: Address) => ExternalContract<T>;
declare type ExternalContract<T extends Contract> = GetAddress & ExternalContractMethods<T>;

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
