type Address = import("./Address").Address;
type u256 = import("as-bignum").u256;

type Constructor = (new (...args: any[]) => unknown) | (abstract new (...args: any[]) => unknown);

export function entrypoint(c: Constructor): void;

export abstract class Event {}

export type Indexed<T> = T;

export abstract class Contract {
    static fromAddress<T extends Contract>(this: T, address: Address): ExternalContract<T>;
}

export const ExternalContract: new <T extends Contract>(address: Address) => ExternalContract<T>;
export type ExternalContract<T extends Contract> = ExternalContractMethods<T>;

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
