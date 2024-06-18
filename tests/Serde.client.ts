import { Contract, AbiCoder, getBytesCopy, Result } from "ethers";
import assert from "assert";

export default async function (contract: Contract) {
    const address = await contract.getAddress();

    console.log("Checking u256");
    assert.strictEqual(await contract.u256(42n), 43n);

    const n = 2n ** 256n - 2n;
    assert.strictEqual(await contract.u256(n), n + 1n);

    console.log("Checking address");
    assert.strictEqual(await contract._address(address), address);

    console.log(await contract._addressp1(address), address);

    console.log("Checking struct");
    assert.deepStrictEqual(
        await contract._struct({ foo: 42n, bar: true, baz: address }),
        new Result(43n, false, address)
    );

    console.log("Checking boolean");
    assert.strictEqual(await contract._boolean(true), false);

    console.log("Checking bool");
    assert.strictEqual(await contract._bool(true), false);

    console.log("Checking i8");
    assert.strictEqual(await contract.i8(42), 43n);

    console.log("Checking negative i8");
    assert.strictEqual(await contract.i8(-42), -41n);

    console.log("Checking u8");
    assert.strictEqual(await contract.u8(42), 43n);

    console.log("Checking i16");
    assert.strictEqual(await contract.i16(42), 43n);

    console.log("Checking negative i16");
    assert.strictEqual(await contract.i16(-42), -41n);

    console.log("Checking u16");
    assert.strictEqual(await contract.u16(42), 43n);

    console.log("Checking i32");
    assert.strictEqual(await contract.i32(42), 43n);

    console.log("Checking negative i32");
    assert.strictEqual(await contract.i32(-42), -41n);

    console.log("Checking u32");
    assert.strictEqual(await contract.u32(42), 43n);

    console.log("Checking i64");
    assert.strictEqual(await contract.i64(42), 43n);

    console.log("Checking negative i64");
    assert.strictEqual(await contract.i64(-42), -41n);

    console.log("Checking u64");
    assert.strictEqual(await contract.u64(42), 43n);

    console.log("Checking isize");
    assert.strictEqual(await contract.isize(42), 43n);

    console.log("Checking negative isize");
    assert.strictEqual(await contract.isize(-42), -41n);

    console.log("Checking usize");
    assert.strictEqual(await contract.usize(42), 43n);

    console.log("Checking string");
    assert.strictEqual(await contract._string("foo"), "foo1");

    // console.log(
    //     contract.interface.encodeFunctionData("_dynamicStruct", [
    //         "foo",
    //         {
    //             val: "bar"
    //         }
    //     ])
    // );

    // const fragment = contract.interface.getFunction("_dynamicStruct")!;
    // const bytes = new AbiCoder().encode(fragment.outputs, [
    //     "foo",
    //     {
    //         val: "bar"
    //     }
    // ]);

    // const tx = await contract._dynamicStruct.populateTransaction("foo", { val: "bar" });
    // const bytes = await contract.runner!.call!(tx);
    // console.log(new AbiCoder().decode(fragment.outputs, getBytesCopy(bytes)));

    console.log("Checking dynamic struct");

    assert.deepStrictEqual(await contract._dynamicStruct("foo", { val: "bar" }), new Result("foo", new Result("bar")));
}
