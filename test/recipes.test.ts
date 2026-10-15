import assert from "node:assert/strict";
import test from "node:test";
import { RecipeClient, parsePluginPackage } from "../src/recipes/index.ts";
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

test("installation requires explicit consent", async () => {
  const client = new RecipeClient({ workerFactory: { create: () => new FakeWorker() } });
  await assert.rejects(client.install(plugin), /requires explicit user consent/);
  await assert.rejects(client.install(plugin, { consent: () => false }), /installation declined/);
});
