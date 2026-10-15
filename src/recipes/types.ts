export type PluginId = string;
export type PluginVersion = string;
export type ConsentLifetime = "temporary" | "persistent";

export interface PluginManifest {
  format: 1;
  id: PluginId;
  version: PluginVersion;
  name: string;
  description?: string;
  entry: string;
  capabilities: string[];
  dependencies: string[];
}

export interface PluginModuleSource {
  source: string;
  imports?: Record<string, string>;
}

export interface RecipePluginPackage {
  manifest: PluginManifest;
  modules: Record<string, PluginModuleSource>;
}

export interface ConsentRequest {
  plugin: Pick<PluginManifest, "id" | "version" | "name" | "description" | "capabilities" | "dependencies">;
  lifetime: ConsentLifetime;
}

export interface ConsentRecord {
  pluginId: PluginId;
  version: PluginVersion;
  lifetime: ConsentLifetime;
  grantedAt: number;
}

export interface StoredPlugin {
  package: RecipePluginPackage;
  consent: ConsentRecord;
}

export interface PluginInstallOptions {
  lifetime?: ConsentLifetime;
  consent?: (request: ConsentRequest) => boolean | Promise<boolean>;
}

export interface PluginRunRequest {
  pluginId: PluginId;
  input: unknown;
}

export interface PluginRunResult {
  pluginId: PluginId;
  version: PluginVersion;
  output: unknown;
}

export interface PluginActivationContext {
  capabilities: readonly string[];
}

export interface PluginRuntime {
  run(input: unknown): unknown | Promise<unknown>;
  dispose?(): void | Promise<void>;
}

export type PluginStatus = "installed" | "loading" | "loaded" | "running" | "unloaded" | "failed";

export interface PluginState {
  id: PluginId;
  version: PluginVersion;
  name: string;
  status: PluginStatus;
  lifetime: ConsentLifetime;
  error?: string;
}

export interface WorkerStartMessage {
  type: "start";
  package: RecipePluginPackage;
  capabilities: string[];
}

export interface WorkerRunMessage {
  type: "run";
  requestId: string;
  input: unknown;
}

export interface WorkerStopMessage {
  type: "stop";
}

export type WorkerRequest = WorkerStartMessage | WorkerRunMessage | WorkerStopMessage;

export interface WorkerReadyMessage {
  type: "ready";
  manifest: PluginManifest;
}

export interface WorkerResultMessage {
  type: "result";
  requestId: string;
  output: unknown;
}

export interface WorkerErrorMessage {
  type: "error";
  requestId?: string;
  message: string;
}

export type WorkerResponse = WorkerReadyMessage | WorkerResultMessage | WorkerErrorMessage;

export interface WorkerLike {
  postMessage(message: WorkerRequest): void;
  addEventListener(type: "message" | "error", listener: (event: MessageEvent | ErrorEvent) => void): void;
  removeEventListener?(type: "message" | "error", listener: (event: MessageEvent | ErrorEvent) => void): void;
  terminate(): void;
}

export interface WorkerFactory {
  create(): WorkerLike;
}

export interface PluginStore {
  get(pluginId: PluginId): Promise<StoredPlugin | undefined>;
  put(plugin: StoredPlugin): Promise<void>;
  remove(pluginId: PluginId): Promise<void>;
  list(): Promise<StoredPlugin[]>;
}

export interface RecipeClientOptions {
  workerFactory: WorkerFactory;
  store?: PluginStore;
  now?: () => number;
  requestTimeoutMs?: number;
}
