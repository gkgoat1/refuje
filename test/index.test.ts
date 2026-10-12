import * as assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  AbiCoder,
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
  payAddress,
  payEth,
} from "../src/index.ts";

const encoder = new TextEncoder();
const sender = "0x0000000000000000000000000000000000000001";
const otherSender = "0x0000000000000000000000000000000000000002";
const richBalance = "0x3635c9adc5dea00000";

function bytes(value: string): Uint8Array {
  return getBytes(value);
}

function hex(value: Uint8Array): string {
  return `0x${Buffer.from(value).toString("hex")}`;
}

function repeatedByte(byte: number, length: number): Uint8Array {
  return new Uint8Array(length).fill(byte);
}

function randomAddress(): string {
  return hex(randomBytes(20));
}

async function artifact(name: string) {
  return JSON.parse(
    await readFile(
      new URL(`../out/${name}.sol/${name}.json`, import.meta.url),
      "utf8",
    ),
  );
}

async function deploy(signer: any, name: string): Promise<any> {
  const value = await artifact(name);
  const factory = new ContractFactory(
    value.abi,
    value.bytecode.object ?? value.bytecode,
    signer,
  );
  const contract: any = await factory.deploy();
  await contract.waitForDeployment();
  return contract;
}

async function fixture() {
  const provider = new JsonRpcProvider("http://localhost:8545");
  await provider.getBlockNumber();
  for (const address of [sender, otherSender]) {
    await provider.send("anvil_setBalance", [address, richBalance]);
    await provider.send("anvil_impersonateAccount", [address]);
  }
  const signer = await provider.getSigner(sender);
  const other = await provider.getSigner(otherSender);
  const contract = await deploy(signer, "Refuje");
  return { provider, signer, other, contract };
}

async function submit(
  provider: JsonRpcProvider,
  signer: any,
  contract: any,
  finalizer: any,
  targets: Targets,
  tree: MerkleTree,
) {
  const request = await finalizer.finalize(contract, targets, tree);
  const transaction = await signer.sendTransaction(request);
  for (let i = 0; i < 120; i++) {
    const receipt = await provider.send("eth_getTransactionReceipt", [
      transaction.hash,
    ]);
    if (receipt) return receipt;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`timed out waiting for ${transaction.hash}`);
}

async function registerAndDepositEth(
  contract: any,
  key: Privatekey,
  tree: MerkleTree,
  value: bigint,
) {
  await (await contract.registerPubKey(key.pubkey().array)).wait();
  await (
    await contract.depositToKey(BigInt(hex(tree.hash())), { value })
  ).wait();
}

test("public key recovers from a signature", () => {
  const key = new Privatekey({ array: repeatedByte(0x01, 32) });
  const hash = repeatedByte(0x23, 32);

  assert.deepEqual(
    Array.from(key.pubkey().array),
    Array.from(key.sign(hash).recover(hash).array),
  );
});

test("clients encode padded target records, flags, blobs, and payment metadata", () => {
  const token = "0x1111111111111111111111111111111111111111";
  const callAddress = "0x2222222222222222222222222222222222222222";
  const callData = "0x12345678";
  const key = repeatedByte(0xab, 32);
  const targets = new Targets();

  targets.push_key(0x1234n, key);
  const addressTarget = targets.pushAddress(0x5678n, callAddress);
  addressTarget.approve();
  addressTarget.requireSender();
  addressTarget.call({ to: callAddress, data: callData });
  addressTarget.call({ to: callAddress, data: "0xbeef" });
  addressTarget[Symbol.dispose]();

  assert.equal(targets.array.length, 160);
  assert.deepEqual(
    targets.array.slice(0, 32),
    new Uint8Array([...new Uint8Array(30), 0x12, 0x34]),
  );
  assert.deepEqual(targets.array.slice(32, 64), key);
  assert.equal(targets.array[64 + 31], 0x78);
  assert.equal(targets.array[64 + 63], 0xc1);

  const blob = AbiCoder.defaultAbiCoder().encode(
    ["address", "bytes1", "bytes"],
    [callAddress, new Uint8Array([0]), callData],
  );
  assert.deepEqual(targets.blobs, [bytes(blob)]);
  assert.deepEqual(targets.array.slice(128), bytes(keccak256(blob)));

  const payment = new payAddress({ addr: token });
  assert.deepEqual(
    payment.encodeTargets(targets),
    new Uint8Array([
      ...encoder.encode("pay20"),
      ...getBytes(token),
      ...targets.array,
    ]),
  );
});

test("rejects target keys with the wrong wire width", () => {
  const targets = new Targets();
  assert.throws(() => targets.push_key(1n, new Uint8Array(31)), RangeError);
  assert.throws(() => targets.push_key(1n, new Uint8Array(33)), RangeError);
});

test("payment clients reject paths that cannot be sent as bytes32", () => {
  const key = new Privatekey({ array: repeatedByte(0x02, 32) });
  assert.throws(
    () => new payEth().pay(key, new Uint8Array(31), new MerkleTree()),
    RangeError,
  );
  assert.throws(
    () =>
      new payAddress({ addr: randomAddress() }).pay(
        key,
        new Uint8Array(33),
        new MerkleTree(),
      ),
    RangeError,
  );
});

test("payAddress uses the Solidity metadata preimage and supports nonzero paths", () => {
  const token = "0x3333333333333333333333333333333333333333";
  const path = repeatedByte(0xa5, 32);
  const key = new Privatekey({ array: repeatedByte(0x02, 32) });
  const tree = new MerkleTree();
  const payment = new payAddress({ addr: token });
  const targets = new Targets();
  const targetScope = targets.pushAddress(123n, randomAddress());
  targetScope[Symbol.dispose]();

  payment.pay(key, path, tree);
  const treePath = bytes(
    keccak256(
      new Uint8Array([
        ...encoder.encode("pay20"),
        ...getBytes(token),
        ...path,
      ]),
    ),
  );
  const proof = tree.prove(bools_bytes(treePath));
  let root = key.pubkey().array;
  for (const [i, sibling] of proof.entries()) {
    const pathBit = (treePath[i >> 3] >> (i & 7)) & 1;
    const [left, right] = pathBit ? [sibling, root] : [root, sibling];
    root = bytes(keccak256(new Uint8Array([...left, ...right])));
  }

  assert.deepEqual(root, tree.hash());
  assert.deepEqual(
    payment.encodeTargets(targets),
    new Uint8Array([
      ...encoder.encode("pay20"),
      ...getBytes(token),
      ...targets.array,
    ]),
  );
});

test("withdraws ETH to multiple addresses with one fee per target", { timeout: 30_000 }, async () => {
  const { provider, signer, contract } = await fixture();
  try {
    const key = new Privatekey({ array: repeatedByte(0x04, 32) });
    const path = repeatedByte(0x17, 32);
    const tree = new MerkleTree();
    const finalizer = new payEth().pay(key, path, tree);
    const targets = new Targets();
    const target1 = randomAddress();
    const target2 = randomAddress();
    const amount1 = 1_000_000_000n;
    const amount2 = 2_000_000_000n;
    const first = targets.pushAddress(amount1, target1);
    first[Symbol.dispose]();
    const second = targets.pushAddress(amount2, target2);
    second[Symbol.dispose]();

    await registerAndDepositEth(contract, key, tree, amount1 + amount2);
    await submit(provider, signer, contract, finalizer, targets, tree);

    assert.equal(await provider.getBalance(target1), amount1 - (amount1 >> 7n));
    assert.equal(await provider.getBalance(target2), amount2 - (amount2 >> 7n));
    assert.equal(await provider.getBalance(contract.target), 0n);
  } finally {
    provider.destroy();
  }
});

test("moves ETH between keys, checks the sender flag, and rejects replay", { timeout: 30_000 }, async () => {
  const { provider, signer, other, contract } = await fixture();
  try {
    const source = new Privatekey({ array: repeatedByte(0x05, 32) });
    const destination = new Privatekey({ array: repeatedByte(0x06, 32) });
    const destination2 = new Privatekey({ array: repeatedByte(0x16, 32) });
    const sourceTree = new MerkleTree();
    const destinationTree = new MerkleTree();
    const destinationTree2 = new MerkleTree();
    const destinationFinalizer = new payEth().pay(
      destination,
      repeatedByte(0x22, 32),
      destinationTree,
    );
    const destinationFinalizer2 = new payEth().pay(
      destination2,
      repeatedByte(0x23, 32),
      destinationTree2,
    );
    const sourceFinalizer = new payEth().pay(source, repeatedByte(0x21, 32), sourceTree);
    const sourceTargets = new Targets();
    sourceTargets.push_key(600_000_000n, destinationTree.hash());
    sourceTargets.push_key(400_000_000n, destinationTree2.hash());

    await registerAndDepositEth(contract, source, sourceTree, 1_000_000_000n);
    await submit(provider, signer, contract, sourceFinalizer, sourceTargets, sourceTree);

    const destinationTargets = new Targets();
    const destinationScope = destinationTargets.pushAddress(400_000_000n, sender);
    destinationScope.requireSender();
    destinationScope[Symbol.dispose]();
    const destinationTargets2 = new Targets();
    const destinationScope2 = destinationTargets2.pushAddress(300_000_000n, randomAddress());
    destinationScope2[Symbol.dispose]();
    await registerAndDepositEth(contract, destination, destinationTree, 0n);
    await registerAndDepositEth(contract, destination2, destinationTree2, 0n);

    const request = await destinationFinalizer.finalize(
      contract,
      destinationTargets,
      destinationTree,
    );
    await assert.rejects(() => other.sendTransaction(request));
    await submit(
      provider,
      signer,
      contract,
      destinationFinalizer,
      destinationTargets,
      destinationTree,
    );
    await assert.rejects(() => signer.sendTransaction(request));
    await submit(
      provider,
      signer,
      contract,
      destinationFinalizer2,
      destinationTargets2,
      destinationTree2,
    );
  } finally {
    provider.destroy();
  }
});

test("deposits and withdraws ERC-20 tokens in transfer and approval modes", { timeout: 30_000 }, async () => {
  const { provider, signer, contract } = await fixture();
  try {
    const token = await deploy(signer, "MockERC20");
    const transferKey = new Privatekey({ array: repeatedByte(0x07, 32) });
    const transferTree = new MerkleTree();
    const transferPayment = new payAddress({ addr: String(token.target) });
    const transferFinalizer = transferPayment.pay(
      transferKey,
      repeatedByte(0x31, 32),
      transferTree,
    );
    const transferTargets = new Targets();
    const transferTarget = randomAddress();
    const transferAmount = 1_000_000_000n;
    const transferScope = transferTargets.pushAddress(transferAmount, transferTarget);
    transferScope[Symbol.dispose]();

    const approveKey = new Privatekey({ array: repeatedByte(0x08, 32) });
    const approveTree = new MerkleTree();
    const approvePayment = new payAddress({ addr: String(token.target) });
    const approveFinalizer = approvePayment.pay(
      approveKey,
      repeatedByte(0x32, 32),
      approveTree,
    );
    const approveTargets = new Targets();
    const approveTarget = randomAddress();
    const approveAmount = 2_000_000_000n;
    const approveScope = approveTargets.pushAddress(approveAmount, approveTarget);
    approveScope.approve();
    approveScope[Symbol.dispose]();

    const funding = transferAmount + approveAmount;
    await (await token.mint(sender, funding)).wait();
    await (await token.approve(contract.target, funding)).wait();
    await registerAndDepositErc20(contract, token, transferKey, transferTree, transferAmount);
    await registerAndDepositErc20(contract, token, approveKey, approveTree, approveAmount);

    await submit(provider, signer, contract, transferFinalizer, transferTargets, transferTree);
    await submit(provider, signer, contract, approveFinalizer, approveTargets, approveTree);

    assert.equal(
      await token.balanceOf(transferTarget),
      transferAmount - (transferAmount >> 7n),
    );
    assert.equal(await token.balanceOf(approveTarget), 0n);
    assert.equal(
      await token.allowance(contract.target, approveTarget),
      approveAmount - (approveAmount >> 7n),
    );
    assert.equal(await token.balanceOf(contract.target), approveAmount - (approveAmount >> 7n));
    assert.equal(
      await token.balanceOf(sender),
      (transferAmount >> 7n) + (approveAmount >> 7n),
    );
  } finally {
    provider.destroy();
  }
});

async function registerAndDepositErc20(
  contract: any,
  token: any,
  key: Privatekey,
  tree: MerkleTree,
  value: bigint,
) {
  await (await contract.registerPubKey(key.pubkey().array)).wait();
  await (
    await contract.depositErc20(
      token.target,
      BigInt(hex(tree.hash())),
      value,
      sender,
    )
  ).wait();
}

test("executes a call blob after paying its address target", { timeout: 30_000 }, async () => {
  const { provider, signer, contract } = await fixture();
  try {
    const callTarget = await deploy(signer, "CallTarget");
    const key = new Privatekey({ array: repeatedByte(0x09, 32) });
    const tree = new MerkleTree();
    const finalizer = new payEth().pay(key, repeatedByte(0x41, 32), tree);
    const targets = new Targets();
    const targetScope = targets.pushAddress(0n, callTarget.target);
    const call = await callTarget.setValue.populateTransaction(42n);
    targetScope.call(call);
    targetScope[Symbol.dispose]();

    await registerAndDepositEth(contract, key, tree, 0n);
    await submit(provider, signer, contract, finalizer, targets, tree);

    assert.equal(await callTarget.value(), 42n);
    assert.equal(await callTarget.lastCaller(), contract.target);
  } finally {
    provider.destroy();
  }
});

test("rejects an underfunded withdrawal", { timeout: 30_000 }, async () => {
  const { provider, signer, contract } = await fixture();
  try {
    const key = new Privatekey({ array: repeatedByte(0x0a, 32) });
    const tree = new MerkleTree();
    const finalizer = new payEth().pay(key, repeatedByte(0x51, 32), tree);
    const targets = new Targets();
    const scope = targets.pushAddress(1n, randomAddress());
    scope[Symbol.dispose]();
    await registerAndDepositEth(contract, key, tree, 0n);

    const request = await finalizer.finalize(contract, targets, tree);
    await assert.rejects(() => signer.sendTransaction(request));
  } finally {
    provider.destroy();
  }
});
