import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluatePolicy,
  MemoryExecutionStore,
  MockRelayClient,
  normalizePlan,
  PolicyViolationError,
  RecipeClient,
  RecipeOrchestrator,
  RefujeRecipeApi,
  RefujeRailgunIntegration,
  RailgunRecipeApi,
  parsePluginPackage,
  serializePlan,
} from "../src/recipes/index.ts";
import type { BridgeAdapter } from "../src/recipes/index.ts";
import { ClientPluginStore, MemoryFileStorage, createMemoryKeyValueStorage } from "../src/recipes/store.ts";
import type { RecipePluginPackage, WorkerLike, WorkerRequest } from "../src/recipes/types.ts";

const plugin: RecipePluginPackage = {
  manifest: {
    format: 1,
    id: "echo.recipe",
    version: "1.0.0",
    name: "Echo recipe",
    entry: "entry",
    capabilities: ["refuje:read"],
    dependencies: ["entry"],
  },
  modules: {
    entry: { source: "export function activate(ctx) { return { run(input) { return { input, capabilities: ctx.capabilities }; } }; }" },
  },
};

class FakeWorker implements WorkerLike {
  private readonly listeners = new Map<string, Set<(event: any) => void>>();
  terminated = false;

  postMessage(message: WorkerRequest): void {
    if (this.terminated) return;
    queueMicrotask(() => {
      if (message.type === "start") this.emit("message", { type: "message", data: { type: "ready", manifest: message.package.manifest } });
      if (message.type === "run") this.emit("message", { type: "message", data: { type: "result", requestId: message.requestId, output: message.input } });
    });
  }

  addEventListener(type: "message" | "error", listener: (event: MessageEvent | ErrorEvent) => void): void {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  terminate(): void {
    this.terminated = true;
    this.listeners.clear();
  }

  private emit(type: string, event: unknown): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

test("parses a valid plugin package and rejects missing modules", () => {
  assert.equal(parsePluginPackage(plugin).manifest.id, "echo.recipe");
  assert.throws(() => parsePluginPackage({ ...plugin, manifest: { ...plugin.manifest, entry: "missing" } }), /entry is not present/);
});

test("persistent plugin storage uses metadata and file storage", async () => {
  const store = new ClientPluginStore(createMemoryKeyValueStorage(), new MemoryFileStorage());
  await store.put({ package: plugin, consent: { pluginId: plugin.manifest.id, version: "1.0.0", lifetime: "persistent", grantedAt: 1 } });
  assert.equal((await store.get(plugin.manifest.id))?.package.manifest.name, "Echo recipe");
  assert.equal((await store.list()).length, 1);
});

test("temporary plugin storage is isolated to the client lifetime", async () => {
  const store = new ClientPluginStore(createMemoryKeyValueStorage(), new MemoryFileStorage());
  await store.put({ package: plugin, consent: { pluginId: plugin.manifest.id, version: "1.0.0", lifetime: "temporary", grantedAt: 1 } });
  assert.ok(await store.get(plugin.manifest.id));
  const fresh = new ClientPluginStore(createMemoryKeyValueStorage(), new MemoryFileStorage());
  assert.equal(await fresh.get(plugin.manifest.id), undefined);
});

test("headless client installs, loads, runs, and unloads a plugin", async () => {
  const workers: FakeWorker[] = [];
  const client = new RecipeClient({
    workerFactory: { create: () => { const worker = new FakeWorker(); workers.push(worker); return worker; } },
    requestTimeoutMs: 500,
  });
  await client.install(plugin, { lifetime: "temporary", consent: async () => true });
  assert.equal((await client.load(plugin.manifest.id)).status, "loaded");
  assert.deepEqual((await client.run(plugin.manifest.id, { amount: 7 })).output, { amount: 7 });
  await client.unload(plugin.manifest.id);
  assert.equal(client.status(plugin.manifest.id)?.status, "unloaded");
  assert.equal(workers[0].terminated, true);
});

const plan = {
  schemaVersion: 1,
  pluginId: "echo.recipe",
  pluginVersion: "1.0.0",
  recipeId: "echo",
  calls: [{ chainId: 1, target: "0x0000000000000000000000000000000000000001", calldata: "0x12345678", value: "0" }],
  approvals: [],
  flows: [{ direction: "input", asset: { kind: "native", chainId: 1 }, amount: "7" }],
  constraints: { deadline: 2_000_000_000, slippageBps: 50 },
  metadata: { z: 1, a: "stable" },
};

test("normalizes and serializes a deterministic plan", () => {
  const normalized = normalizePlan(plan, 1_000_000_000);
  assert.equal(serializePlan(normalized).indexOf('"a":"stable"') < serializePlan(normalized).indexOf('"z":1'), true);
  assert.deepEqual(evaluatePolicy(normalized, { chains: [{ chainId: 1, targets: { "0x0000000000000000000000000000000000000001": { selectors: ["0x12345678"] } } }] }), { allowed: true, issues: [] });
});

test("policy rejects an undeclared selector", () => {
  const normalized = normalizePlan(plan, 1_000_000_000);
  const result = evaluatePolicy(normalized, { chains: [{ chainId: 1, targets: { "0x0000000000000000000000000000000000000001": { selectors: ["0xdeadbeef"] } } }] });
  assert.equal(result.allowed, false);
  assert.equal(result.issues[0]?.code, "SELECTOR_NOT_ALLOWED");
});

test("headless plan rejects policy violations", async () => {
  const client = new RecipeClient({
    workerFactory: { create: () => new FakeWorker() },
    requestTimeoutMs: 500,
  });
  await client.install(plugin, { lifetime: "temporary", consent: async () => true });
  await assert.rejects(
    client.plan(plugin.manifest.id, plan, { chains: [{ chainId: 1, targets: {} }] }),
    (error: unknown) => error instanceof PolicyViolationError && error.result.allowed === false,
  );
});

test("RefujeRecipeApi compiles native and ERC-20 withdrawals", () => {
  const api = new RefujeRecipeApi();
  const base = {
    chainId: 1,
    refujeAddress: "0x0000000000000000000000000000000000000001",
    path: `0x${"11".repeat(32)}`,
    targets: "0x12345678",
    blobs: [] as string[],
    proof: "0x1234",
    asset: { kind: "native" as const },
    flows: [{ direction: "input" as const, asset: { kind: "native" as const, chainId: 1 }, amount: "10" }],
  };
  const eth = api.withdrawal(base);
  const erc20 = api.withdrawal({ ...base, asset: { kind: "erc20", token: "0x0000000000000000000000000000000000000002" }, flows: [{ direction: "input", asset: { kind: "erc20", chainId: 1, token: "0x0000000000000000000000000000000000000002" }, amount: "10" }] });
  assert.match(eth.calls[0].calldata, /^0x[0-9a-f]+$/);
  assert.match(erc20.calls[0].calldata, /^0x[0-9a-f]+$/);
  assert.notEqual(eth.calls[0].calldata.slice(0, 10), erc20.calls[0].calldata.slice(0, 10));
});

test("RefujeRecipeApi rejects malformed proof material", () => {
  const api = new RefujeRecipeApi();
  assert.throws(() => api.withdrawal({
    chainId: 1,
    refujeAddress: "0x0000000000000000000000000000000000000001",
    path: "0x00",
    targets: "0x",
    blobs: [],
    proof: "0x",
    asset: { kind: "native" },
    flows: [],
  }), /path must be bytes32/);
});

test("cross-chain orchestration reaches settled and rejects replay", async () => {
  const relay = new MockRelayClient(() => 123);
  const bridge: BridgeAdapter = {
    begin(execution) {
      return { bridgeId: `bridge-${execution.id}`, sourceChainId: 1, destinationChainId: 10, amount: "7", recipient: "0x0000000000000000000000000000000000000003", expiresAt: 200 };
    },
    observe(execution) {
      return execution;
    },
  };
  const orchestrator = new RecipeOrchestrator({ store: new MemoryExecutionStore(), relay, bridge });
  const created = await orchestrator.start({ id: "swap-1", idempotencyKey: "key-1", plan: normalizePlan(plan, 1_000_000_000) });
  await orchestrator.submitSource(created.id);
  relay.setStatus("relay-1", { state: "confirmed", confirmedAt: 124 });
  await orchestrator.observeRelay(created.id);
  await orchestrator.beginBridge(created.id);
  await orchestrator.observeBridge(created.id, { type: "destination-ready", bridgeId: "bridge-swap-1", at: 125 });
  await orchestrator.submitDestination(created.id);
  const settled = await orchestrator.settle(created.id);
  assert.equal(settled.status, "settled");
  assert.equal(settled.history.at(-1), "destination settled");

  const spent = await orchestrator.start({ id: "swap-2", idempotencyKey: "key-2", plan: normalizePlan(plan, 1_000_000_000), spentAuthorization: "auth-1" });
  await assert.rejects(orchestrator.submitSource(spent.id), /already spent/);
});

test("bridge failure becomes recoverable client state", async () => {
  const relay = new MockRelayClient(() => 321);
  const bridge: BridgeAdapter = {
    begin: (execution) => ({ bridgeId: `bridge-${execution.id}`, sourceChainId: 1, destinationChainId: 10, amount: "7", recipient: "0x0000000000000000000000000000000000000003", expiresAt: 400 }),
    observe: (execution) => execution,
  };
  const orchestrator = new RecipeOrchestrator({ store: new MemoryExecutionStore(), relay, bridge });
  const created = await orchestrator.start({ id: "swap-fail", idempotencyKey: "key-fail", plan: normalizePlan(plan, 1_000_000_000) });
  await orchestrator.submitSource(created.id);
  relay.setStatus("relay-1", { state: "confirmed", confirmedAt: 322 });
  await orchestrator.observeRelay(created.id);
  await orchestrator.beginBridge(created.id);
  const failed = await orchestrator.observeBridge(created.id, { type: "failed", bridgeId: "bridge-swap-fail", reason: "destination rejected" });
  assert.equal(failed.status, "recoverable");
  assert.equal(failed.recoveryReason, "destination rejected");
});

test("RailgunRecipeApi shields and unshields with UTXO accounting", () => {
  const api = new RailgunRecipeApi();
  const utxo = { noteId: "note-1", token: "0x0000000000000000000000000000000000000002", amount: "10", chainId: 1 };
  const shielded = api.shield({ chainId: 1, token: utxo.token, amount: "10", from: "0x0000000000000000000000000000000000000003", railgunAddress: "0x0000000000000000000000000000000000000004", utxo });
  assert.equal(shielded.recipeId, "railgun.shield");
  assert.equal(shielded.metadata?.system, "railgun");
  assert.equal(shielded.flows.length, 2);
  const unshielded = api.unshield({ chainId: 1, token: utxo.token, amount: "10", to: "0x0000000000000000000000000000000000000003", railgunAddress: "0x0000000000000000000000000000000000000004", utxo });
  assert.equal(unshielded.recipeId, "railgun.unshield");
  assert.throws(() => api.shield({ chainId: 1, token: utxo.token, amount: "10", from: "0x0000000000000000000000000000000000000003", railgunAddress: "0x0000000000000000000000000000000000000004", utxo: { ...utxo, amount: "not-a-number" } }), /amount must be a decimal integer/);
});

test("key-to-shielded and shielded-to-key integrations record both systems", () => {
  const integration = new RefujeRailgunIntegration();
  const refuje = {
    chainId: 1,
    refujeAddress: "0x0000000000000000000000000000000000000001",
    path: `0x${"11".repeat(32)}`,
    targets: "0x12345678",
    blobs: [] as string[],
    proof: "0x1234",
    asset: { kind: "native" as const },
    flows: [{ direction: "input" as const, asset: { kind: "native" as const, chainId: 1 }, amount: "10" }],
  };
  const shield = { chainId: 1, token: "0x0000000000000000000000000000000000000002", amount: "10", from: "0x0000000000000000000000000000000000000003", railgunAddress: "0x0000000000000000000000000000000000000004", utxo: { noteId: "note-1", token: "0x0000000000000000000000000000000000000002", amount: "10", chainId: 1 } };
  const unshield = { chainId: 1, token: shield.token, amount: "10", to: "0x0000000000000000000000000000000000000003", railgunAddress: shield.railgunAddress, utxo: shield.utxo };
  const keyToShield = integration.keyToShielded({ refuje, railgun: shield, integrationId: "int-1" });
  assert.deepEqual(keyToShield.metadata?.systems, ["refuje", "railgun"]);
  assert.equal(keyToShield.calls.length, 2);
  const shieldToKey = integration.shieldedToKey({ railgun: unshield, refuje, integrationId: "int-2" });
  assert.deepEqual(shieldToKey.metadata?.systems, ["railgun", "refuje"]);
  assert.equal(shieldToKey.calls.length, 2);
});

test("installation requires explicit consent", async () => {
  const client = new RecipeClient({ workerFactory: { create: () => new FakeWorker() } });
  await assert.rejects(client.install(plugin), /requires explicit user consent/);
  await assert.rejects(client.install(plugin, { consent: () => false }), /installation declined/);
});

test("revoked plugins cannot run and revocation is logged", async () => {
  const client = new RecipeClient({ workerFactory: { create: () => new FakeWorker() }, requestTimeoutMs: 500 });
  await client.install(plugin, { lifetime: "temporary", consent: async () => true });
  await client.revoke(plugin.manifest.id);
  assert.equal(client.isRevoked(plugin.manifest.id), true);
  await assert.rejects(client.run(plugin.manifest.id, { x: 1 }), /revoked/);
  const entries = await client.logEntries();
  assert.equal(entries.some((e) => e.event === "plugin.revoked" && e.pluginId === plugin.manifest.id), true);
});

test("observability redacts secret fields from logs", async () => {
  const client = new RecipeClient({ workerFactory: { create: () => new FakeWorker() }, requestTimeoutMs: 500 });
  await client.install(plugin, { lifetime: "temporary", consent: async () => true });
  await client.run(plugin.manifest.id, { amount: 5 });
  const entries = await client.logEntries();
  const run = entries.find((e) => e.event === "plugin.run");
  assert.ok(run);
  assert.equal(JSON.stringify(run.data).includes("privateKey"), false);
});
