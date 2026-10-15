import type {
  ConsentRecord,
  PluginId,
  PluginStore,
  RecipePluginPackage,
  StoredPlugin,
} from "./types.ts";

function parseJson<T>(value: string, label: string): T {
  try {
    return JSON.parse(value) as T;
  } catch (error) {
    throw new Error(`Corrupt stored ${label}`, { cause: error });
  }
}

export class MemoryPluginStore implements PluginStore {
  private readonly values = new Map<PluginId, StoredPlugin>();

  async get(pluginId: PluginId): Promise<StoredPlugin | undefined> {
    return this.values.get(pluginId);
  }

  async put(plugin: StoredPlugin): Promise<void> {
    this.values.set(plugin.package.manifest.id, plugin);
  }

  async remove(pluginId: PluginId): Promise<void> {
    this.values.delete(pluginId);
  }

  async list(): Promise<StoredPlugin[]> {
    return [...this.values.values()];
  }
}

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface FileStorage {
  read(name: string): Promise<string | undefined>;
  write(name: string, value: string): Promise<void>;
  remove(name: string): Promise<void>;
  list(): Promise<string[]>;
}

export class MemoryFileStorage implements FileStorage {
  private readonly values = new Map<string, string>();

  async read(name: string): Promise<string | undefined> {
    return this.values.get(name);
  }

  async write(name: string, value: string): Promise<void> {
    this.values.set(name, value);
  }

  async remove(name: string): Promise<void> {
    this.values.delete(name);
  }

  async list(): Promise<string[]> {
    return [...this.values.keys()];
  }
}

export class ClientPluginStore implements PluginStore {
  private readonly memory = new MemoryPluginStore();
  private readonly prefix: string;
  private readonly metadata: KeyValueStorage;
  private readonly files: FileStorage;

  constructor(metadata: KeyValueStorage, files: FileStorage, prefix = "refuje.recipe.plugin.") {
    this.metadata = metadata;
    this.files = files;
    this.prefix = prefix;
  }

  async get(pluginId: PluginId): Promise<StoredPlugin | undefined> {
    const temporary = await this.memory.get(pluginId);
    if (temporary) return temporary;
    const metadata = this.metadata.getItem(this.key(pluginId));
    if (!metadata) return undefined;
    const consent = parseJson<ConsentRecord>(metadata, `consent for ${pluginId}`);
    const packageJson = await this.files.read(this.file(pluginId));
    if (!packageJson) return undefined;
    return { package: parseJson<RecipePluginPackage>(packageJson, `package ${pluginId}`), consent };
  }

  async put(plugin: StoredPlugin): Promise<void> {
    const pluginId = plugin.package.manifest.id;
    if (plugin.consent.lifetime === "temporary") {
      await this.memory.put(plugin);
      return;
    }
    this.metadata.setItem(this.key(pluginId), JSON.stringify(plugin.consent));
    await this.files.write(this.file(pluginId), JSON.stringify(plugin.package));
  }

  async remove(pluginId: PluginId): Promise<void> {
    await this.memory.remove(pluginId);
    this.metadata.removeItem(this.key(pluginId));
    await this.files.remove(this.file(pluginId));
  }

  async list(): Promise<StoredPlugin[]> {
    const persistent = await Promise.all((await this.files.list()).map(async (name) => {
      if (!name.startsWith(this.prefix) || !name.endsWith(".json")) return undefined;
      return this.get(name.slice(this.prefix.length, -5));
    }));
    return [...(await this.memory.list()), ...persistent.filter((item): item is StoredPlugin => item !== undefined)];
  }

  private key(pluginId: string): string {
    return `${this.prefix}${pluginId}`;
  }

  private file(pluginId: string): string {
    return `${this.key(pluginId)}.json`;
  }
}

export function createMemoryKeyValueStorage(): KeyValueStorage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
    removeItem: (key) => void values.delete(key),
  };
}
