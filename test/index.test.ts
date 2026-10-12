import * as assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  ContractFactory,
  JsonRpcProvider,
  getBytes,
  keccak256,
  randomBytes,
} from "ethers";
import {
  MerkleTree,
  Privatekey,
  Targets,
  bools_bytes,
  payEth,
} from "../src/index.ts";

const encoder = new TextEncoder();

function bytes(value: string): Uint8Array {
  return getBytes(value);
}

function hex(value: Uint8Array): string {
  return `0x${Buffer.from(value).toString("hex")}`;
}

function repeatedByte(byte: number, length: number): Uint8Array {
  return new Uint8Array(length).fill(byte);
}

test("public key recovers from a signature", () => {
  const key = new Privatekey({ array: repeatedByte(0x01, 32) });
  const hash = repeatedByte(0x23, 32);

  assert.deepEqual(
    Array.from(key.pubkey().array),
    Array.from(key.sign(hash).recover(hash).array),
  );
});

test("ABI preimages and Merkle proofs match Solidity argument encoding", () => {
  const payment = new payEth();
  const targets = new Targets();
  assert.deepEqual(payment.encodeTargets(targets), encoder.encode("pay"));

  const path = new Uint8Array(32);
  const treePath = bytes(keccak256(new Uint8Array([...encoder.encode("pay"), ...path])));
  const key = new Privatekey({ array: repeatedByte(0x01, 32) });
  const tree = new MerkleTree();
  payment.pay(key, path, tree);

  const proof = tree.prove(bools_bytes(treePath));
  let root = key.pubkey().array;
  for (const [i, sibling] of proof.entries()) {
    const pathBit = (treePath[i >> 3] >> (i & 7)) & 1;
    const [left, right] = pathBit ? [sibling, root] : [root, sibling];
    root = bytes(keccak256(new Uint8Array([...left, ...right])));
  }

  assert.deepEqual(root, tree.hash());
});

test("withdraws ETH to a target", { timeout: 30_000 }, async () => {
  const provider = new JsonRpcProvider("http://localhost:8545");
  await provider.getBlockNumber();

  const sender = "0x0000000000000000000000000000000000000001";
  const target = `0x${Buffer.from(randomBytes(20)).toString("hex")}`;
  await provider.send("anvil_setBalance", [sender, "0x3635c9adc5dea00000"]);
  await provider.send("anvil_setBalance", [target, "0x0"]);
  await provider.send("anvil_impersonateAccount", [sender]);
  const signer = await provider.getSigner(sender);

  const artifact = JSON.parse(
    await readFile(new URL("../out/Refuje.sol/Refuje.json", import.meta.url), "utf8"),
  );
  const contract: any = await new ContractFactory(
    artifact.abi,
    artifact.bytecode.object,
    signer,
  ).deploy();
  await contract.waitForDeployment();

  const key = new Privatekey({ array: repeatedByte(0x01, 32) });
  const path = new Uint8Array(32);
  const tree = new MerkleTree();
  const finalizer = new payEth().pay(key, path, tree);
  const targets = new Targets();
  const amount = 1_000_000_000n;
  const payout = amount - (amount >> 7n);
  const targetScope = targets.pushAddress(payout, target);
  targetScope[Symbol.dispose]();

  await (await contract.registerPubKey(key.pubkey().array)).wait();
  await (
    await contract.depositToKey(BigInt(hex(tree.hash())), { value: amount })
  ).wait();

  const transaction = await finalizer.finalize(contract, targets, tree);
  const withdrawal = await signer.sendTransaction(transaction);
  let receipt;
  for (let i = 0; i < 40 && !receipt; i++) {
    receipt = await provider.send("eth_getTransactionReceipt", [withdrawal.hash]);
    if (!receipt) await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert.ok(receipt);
  assert.equal(receipt.status, "0x1");
  assert.equal(await provider.getBalance(target), payout);
  provider.destroy();
});
