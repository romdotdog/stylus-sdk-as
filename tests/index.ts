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
const signer = new ethers.NonceManager(new ethers.Wallet(process.env.PRIVATE_KEY!, provider));

const jsTests = path.dirname(fileURLToPath(import.meta.url));
const wasmPath = path.join("tests", "out.wasm");

const files = await fs.readdir("tests");
const specificTest = process.argv[2];
for (const file of files) {
    if (file.endsWith(".client.ts") && (specificTest === undefined || specificTest === file)) {
        const test = path.join(jsTests, file.replace(/\.client\.ts$/, ".client.js"));
        const f = await import(test);

        const contractPath = path.join("tests", file.replace(/\.client\.ts$/, ".contract.ts"));

        console.log(`running ${file}`);
        const { wasmPath, abi } = await compile(contractPath);
        //console.log(abi);
        console.log("done compiling");
        const address = await deploy(wasmPath);
        console.log("done deploying");

        const contract = new ethers.Contract(address, abi.split("\n"), signer);
        await f.default(contract);

        console.log("done testing");
        console.log();
    }
}

await fs.unlink(wasmPath);

async function compile(contract: string) {
    let abi = "";

    const { error, stdout, stderr } = await asc.main([contract, "--target", "test"], {
        writeFile(filename, contents, baseDir) {
            if (filename === wasmPath) {
                return fs.writeFile(wasmPath, contents);
            } else if (filename === "abi") {
                abi = contents.toString();
                return Promise.resolve();
            }

            throw new Error("extra output file: " + filename);
        }
    });

    if (error) {
        console.log("Compilation failed: " + error.message);
        console.log(stderr.toString());
        process.exit(1);
    }

    //console.log(stdout.toString());

    if (!existsSync(wasmPath)) {
        throw new Error("wasm not found");
    }
    return { wasmPath, abi };
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

    const address = stdout.match(/Deploying program to address.+?(0x[0-9a-fA-F]+)/u)?.[1];

    if (address === undefined) {
        console.log(stdout);
        throw new Error("failed to retrieve address");
    }

    return address;
}
