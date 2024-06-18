import { Contract } from "ethers";
import assert from "assert";

export default async function (contract: Contract) {
    assert.strictEqual(await contract.get(), 1n);
}