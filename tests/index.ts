import * as fs from "fs/promises";
import * as path from "path";

import asc from "assemblyscript/dist/asc.js";

import { existsSync } from "fs";
import { exec as execCb } from "child_process";
import { promisify } from "util";
import { fileURLToPath } from "url";

import { config } from "dotenv";
import { ethers } from "ethers";

config({ path: ".env.test" });

const exec = promisify(execCb);

const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
const signer = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);

const jsTests = path.dirname(fileURLToPath(import.meta.url));
const files = await fs.readdir("tests");
for (const file of files) {
    if (file.endsWith(".client.ts")) {
        const test = path.join(jsTests, file.replace(/\.client\.ts$/, ".client.js"));
        const f = await import(test);

        const contract = path.join("tests", file.replace(/\.client\.ts$/, ".contract.ts"));

        console.log(`running ${file}`);
        const wasmPath = await compile(contract);
        console.log("done compiling");
        const address = await deploy(wasmPath);
        console.log("done deploying");

        if (address === undefined) {
            throw new Error("failed to retrieve address");
        }

        // TODO: instantiate contract here when we have ABI generation
        await f.default(address, new ethers.NonceManager(signer));

        console.log("done testing");

        await fs.unlink(wasmPath);
    }
}

async function compile(contract: string) {
    const { error, stdout, stderr } = await asc.main([contract, "--target", "test"]);

    if (error) {
        console.log("Compilation failed: " + error.message);
        console.log(stderr.toString());
        process.exit(1);
    }

    //console.log(stdout.toString());

    const wasmPath = path.join("tests", "out.wasm");
    if (!existsSync(wasmPath)) {
        throw new Error("wasm not found");
    }
    return wasmPath;
}

async function deploy(wasmPath: string) {
    const rpcUrl = process.env.RPC_URL;
    const endpoint = rpcUrl ? `--endpoint ${rpcUrl}` : "";
    const { stdout, stderr } = await exec(
        `cargo stylus deploy --wasm-file-path ${wasmPath} --private-key ${process.env.PRIVATE_KEY} ${endpoint}`
    );

    if (stderr) {
        console.log(`stderr: ${stderr}`);
        throw new Error("failed to deploy contract");
    }

    //console.log(stdout);

    return stdout.match(/Deploying program to address.+?(0x[0-9a-fA-F]+)/u)?.[1];
}
