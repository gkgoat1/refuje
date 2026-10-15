import { consentRequest, parsePluginPackage } from "./package.ts";
import { normalizePlan, type RecipePlan } from "./plan.ts";
import { evaluatePolicy, PolicyViolationError, type PolicyConfig, type PolicyResult } from "./policy.ts";
import { MemoryPluginStore } from "./store.ts";
import type {
  PluginId,
  PluginInstallOptions,
  PluginRunResult,
  PluginState,
  PluginStore,
  RecipePluginPackage,
  RecipeClientOptions,
  StoredPlugin,
  WorkerLike,
  WorkerResponse,
} from "./types.ts";

interface LoadedPlugin {
  worker: WorkerLike;
  state: PluginState;
  nextRequest: number;
  pending: Map<string, { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>;
}

export class RecipeClient {
  private readonly options: RecipeClientOptions;
  private readonly store: PluginStore;
  private readonly now: () => number;
  private readonly timeoutMs: number;
  private readonly states = new Map<PluginId, PluginState>();
  private readonly loaded = new Map<PluginId, LoadedPlugin>();

  constructor(options: RecipeClientOptions) {
    this.options = options;
    this.store = options.store ?? new MemoryPluginStore();
    this.now = options.now ?? Date.now;
    this.timeoutMs = options.requestTimeoutMs ?? 15_000;
  }

  async install(input: unknown, options: PluginInstallOptions = {}): Promise<PluginState> {
    const plugin = parsePluginPackage(input);
    const request = consentRequest(plugin, options);
    if (!options.consent) throw new Error("Plugin installation requires explicit user consent.");
    if (!(await options.consent(request))) throw new Error(`Plugin installation declined: ${plugin.manifest.id}`);

    const consent = {
      pluginId: plugin.manifest.id,
      version: plugin.manifest.version,
      lifetime: request.lifetime,
      grantedAt: this.now(),
    } as const;
    await this.store.put({ package: plugin, consent });
    const state: PluginState = {
      id: plugin.manifest.id,
      version: plugin.manifest.version,
      name: plugin.manifest.name,
      status: "installed",
      lifetime: consent.lifetime,
    };
    this.states.set(state.id, state);
    return state;
  }

  async installed(): Promise<PluginState[]> {
    const plugins = await this.store.list();
    return plugins.map((plugin) => this.stateFor(plugin));
  }

  async load(pluginId: PluginId): Promise<PluginState> {
    if (this.loaded.has(pluginId)) return this.loaded.get(pluginId)!.state;
    const stored = await this.store.get(pluginId);
    if (!stored) throw new Error(`Plugin is not installed: ${pluginId}`);
    const state = this.stateFor(stored, "loading");
    this.states.set(pluginId, state);
    const worker = this.options.workerFactory.create();
    const loaded: LoadedPlugin = {
      worker,
      state,
      nextRequest: 0,
      pending: new Map(),
    };
    this.loaded.set(pluginId, loaded);
    worker.addEventListener("message", (event) => this.handleMessage(pluginId, event as MessageEvent<WorkerResponse>));
    worker.addEventListener("error", (event) => {
      const message = event.type === "error" && "message" in event ? String(event.message) : "Plugin Worker failed";
      this.failWorker(pluginId, new Error(message));
    });

    try {
      await this.waitForReady(pluginId, worker, stored.package);
      loaded.state = this.stateFor(stored, "loaded");
      this.states.set(pluginId, loaded.state);
      return loaded.state;
    } catch (error) {
      this.failWorker(pluginId, error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  async run(pluginId: PluginId, input: unknown): Promise<PluginRunResult> {
    const loaded = this.loaded.get(pluginId);
    if (!loaded) await this.load(pluginId);
    const active = this.loaded.get(pluginId);
    if (!active) throw new Error(`Plugin failed to load: ${pluginId}`);
    active.state = { ...active.state, status: "running", error: undefined };
    this.states.set(pluginId, active.state);
    const requestId = `${pluginId}:${active.nextRequest++}`;
    const output = await new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        active.pending.delete(requestId);
        reject(new Error(`Plugin timed out: ${pluginId}`));
      }, this.timeoutMs);
      active.pending.set(requestId, { resolve, reject, timer });
      active.worker.postMessage({ type: "run", requestId, input });
    });
    active.state = { ...active.state, status: "loaded" };
    this.states.set(pluginId, active.state);
    return { pluginId, version: active.state.version, output };
  }

  async plan(pluginId: PluginId, input: unknown, policy?: PolicyConfig): Promise<{ plan: RecipePlan; policy: PolicyResult }> {
    const result = await this.run(pluginId, input);
    const plan = normalizePlan(result.output);
    const policyResult = policy ? evaluatePolicy(plan, policy) : { allowed: true, issues: [] };
    if (!policyResult.allowed) throw new PolicyViolationError(policyResult);
    return { plan, policy: policyResult };
  }

  async unload(pluginId: PluginId): Promise<void> {
    const loaded = this.loaded.get(pluginId);
    if (!loaded) {
      const state = this.states.get(pluginId);
      if (state) this.states.set(pluginId, { ...state, status: "unloaded" });
      return;
    }
    loaded.worker.postMessage({ type: "stop" });
    loaded.worker.terminate();
    for (const pending of loaded.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error(`Plugin unloaded: ${pluginId}`));
    }
    loaded.pending.clear();
    this.loaded.delete(pluginId);
    this.states.set(pluginId, { ...loaded.state, status: "unloaded" });
  }

  async uninstall(pluginId: PluginId): Promise<void> {
    await this.unload(pluginId);
    await this.store.remove(pluginId);
    this.states.delete(pluginId);
  }

  status(pluginId: PluginId): PluginState | undefined {
    return this.states.get(pluginId);
  }

  private async waitForReady(pluginId: PluginId, worker: WorkerLike, plugin: RecipePluginPackage): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          reject(new Error(`Plugin did not start: ${pluginId}`));
        }
      }, this.timeoutMs);
      const listener = (event: MessageEvent<WorkerResponse> | ErrorEvent) => {
        if (settled) return;
        if (event.type === "error") {
          settled = true;
          clearTimeout(timer);
          reject(new Error("message" in event ? String(event.message) : `Plugin Worker failed: ${pluginId}`));
          return;
        }
        const message = (event as MessageEvent<WorkerResponse>).data;
        if (message.type === "ready") {
          settled = true;
          clearTimeout(timer);
          resolve();
        } else if (message.type === "error") {
          settled = true;
          clearTimeout(timer);
          reject(new Error(message.message));
        }
      };
      worker.addEventListener("message", listener as (event: MessageEvent | ErrorEvent) => void);
      worker.addEventListener("error", listener as (event: MessageEvent | ErrorEvent) => void);
      worker.postMessage({ type: "start", package: plugin, capabilities: plugin.manifest.capabilities });
    });
  }

  private handleMessage(pluginId: PluginId, event: MessageEvent<WorkerResponse>): void {
    const loaded = this.loaded.get(pluginId);
    if (!loaded) return;
    const message = event.data;
    if (message.type !== "result" && message.type !== "error") return;
    if (!message.requestId) return;
    const pending = loaded.pending.get(message.requestId);
    if (!pending) return;
    clearTimeout(pending.timer);
    loaded.pending.delete(message.requestId);
    if (message.type === "error") pending.reject(new Error(message.message));
    else pending.resolve(message.output);
  }

  private failWorker(pluginId: PluginId, error: Error): void {
    const loaded = this.loaded.get(pluginId);
    if (!loaded) return;
    for (const pending of loaded.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    loaded.pending.clear();
    loaded.state = { ...loaded.state, status: "failed", error: error.message };
    this.states.set(pluginId, loaded.state);
    loaded.worker.terminate();
    this.loaded.delete(pluginId);
  }

  private stateFor(stored: StoredPlugin, status: PluginState["status"] = "installed"): PluginState {
    return {
      id: stored.package.manifest.id,
      version: stored.package.manifest.version,
      name: stored.package.manifest.name,
      status,
      lifetime: stored.consent.lifetime,
    };
  }
}
