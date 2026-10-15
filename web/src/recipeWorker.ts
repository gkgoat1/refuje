/// <reference lib="webworker" />

import type {
  PluginActivationContext,
  PluginRuntime,
  RecipePluginPackage,
  WorkerRequest,
  WorkerResponse,
} from "../../src/recipes/types.ts";
import { materializeModuleGraph, releaseModuleGraph, type MaterializedModules } from "./pluginLoader.ts";

let runtime: PluginRuntime | undefined;
let materialized: MaterializedModules | undefined;

const scope = self as DedicatedWorkerGlobalScope;

function send(message: WorkerResponse): void {
  scope.postMessage(message);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function activate(plugin: RecipePluginPackage, capabilities: string[]): Promise<void> {
  materialized = await materializeModuleGraph(plugin);
  const loaded = await import(/* @vite-ignore */ materialized.entryUrl) as {
    default?: unknown;
    activate?: (context: PluginActivationContext) => PluginRuntime | Promise<PluginRuntime>;
  };
  const candidate = loaded.activate ?? (loaded.default as { activate?: typeof loaded.activate } | undefined)?.activate ?? loaded.default;
  if (typeof candidate !== "function") throw new Error("Plugin entry must export activate(context) or a default activation function");
  const activated = await candidate({ capabilities });
  runtime = typeof activated === "function" ? { run: activated as (input: unknown) => unknown } : activated;
  if (!runtime || typeof runtime.run !== "function") throw new Error("Plugin activation did not return a run function");
  send({ type: "ready", manifest: plugin.manifest });
}

async function stop(): Promise<void> {
  await runtime?.dispose?.();
  runtime = undefined;
  if (materialized) releaseModuleGraph(materialized);
  materialized = undefined;
}

scope.addEventListener("message", (event: MessageEvent<WorkerRequest>) => {
  void (async () => {
    try {
      const request = event.data;
      if (request.type === "start") {
        await stop();
        await activate(request.package, request.capabilities);
      } else if (request.type === "run") {
        if (!runtime) throw new Error("Plugin is not active");
        const output = await runtime.run(request.input);
        send({ type: "result", requestId: request.requestId, output });
      } else if (request.type === "stop") {
        await stop();
      }
    } catch (error) {
      send({ type: "error", requestId: event.data.type === "run" ? event.data.requestId : undefined, message: errorMessage(error) });
    }
  })();
});
