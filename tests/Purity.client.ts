import { Contract } from "ethers";
import assert from "assert";

export default function (contract: Contract) {
    const asserts: Record<string, "nonpayable" | "view" | "pure"> = {
        basicPure: "pure",
        basicView: "view",
        basicImpure: "nonpayable",

        _pure: "pure",
        _view: "view",
        _impure: "nonpayable",

        pureComplex: "pure",
        viewComplex: "view",
        impureComplex: "nonpayable",

        overwritePure: "pure",
        overwriteView: "view",
        overwriteImpure: "nonpayable",

        nestedFunctionPure: "pure",
        nestedFunctionView: "view",
        nestedFunctionImpure: "nonpayable",

        impureAdvanced: "nonpayable",
        pureAdvanced: "pure",

        impureAdvanced2: "nonpayable",
        impureAdvanced3: "nonpayable"
    };

    for (const [fn, purity] of Object.entries(asserts)) {
        assert.strictEqual(contract.interface.getFunction(fn)?.stateMutability, purity, fn);
    }
}
