import { Contract, ContractRunner, EventLog } from "ethers";
import assert from "assert";

export default async function (address: string, provider: ContractRunner) {
    const abi = [
        "event NumberChanged(uint256 indexed n)",
        "function number() external view returns (uint256)",
        "function setNumber(uint256 n) external",
        "function increment() external",
        "function thisAddress() external view returns (address)"
    ];

    async function event(tx: any) {
        const receipt = await tx.wait();
        assert.strictEqual(receipt.logs.length, 1);
        return receipt.logs[0] as EventLog;
    }

    const contract = new Contract(address, abi, provider);

    console.log("Checking Counter.thisAddress()");
    assert.strictEqual(await contract.thisAddress(), address);

    console.log("Checking initial Counter.number()");
    assert.strictEqual(await contract.number(), 0n);

    console.log("Counter.increment()");
    let ev = await event(await contract.increment());
    assert.strictEqual(await contract.number(), 1n);
    assert.strictEqual(ev.args[0], 1n);

    console.log("Counter.setNumber(42)");
    ev = await event(await contract.setNumber(42n));
    assert.strictEqual(await contract.number(), 42n);
    assert.strictEqual(ev.args[0], 42n);

    console.log("Counter.increment() again");
    ev = await event(await contract.increment());
    assert.strictEqual(await contract.number(), 43n);
    assert.strictEqual(ev.args[0], 43n);
}
