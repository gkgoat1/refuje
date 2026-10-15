import {
  ClientPluginStore,
  createMemoryKeyValueStorage,
  MemoryFileStorage,
  type FileStorage,
  type KeyValueStorage,
} from "../../src/recipes/store.ts";

type OpfsStorage = {
  getDirectory?: () => Promise<any>;
};

class OpfsFileStorage implements FileStorage {
  private readonly root: Promise<any>;

  constructor(getDirectory: () => Promise<any>) {
    this.root = getDirectory();
  }

  async read(name: string): Promise<string | undefined> {
    try {
      const directory = await this.root;
      const file = await directory.getFileHandle(name);
      return (await file.getFile()).text();
    } catch (error) {
      if (error instanceof DOMException && error.name === "NotFoundError") return undefined;
      throw error;
    }
  }

  async write(name: string, value: string): Promise<void> {
    const directory = await this.root;
    const file = await directory.getFileHandle(name, { create: true });
    const writable = await file.createWritable();
    await writable.write(value);
    await writable.close();
  }

  async remove(name: string): Promise<void> {
    try {
      const directory = await this.root;
      await directory.removeEntry(name);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "NotFoundError")) throw error;
    }
  }

  async list(): Promise<string[]> {
    const directory = await this.root;
    const names: string[] = [];
    for await (const [name] of directory.entries()) names.push(name);
    return names;
  }
}

export function browserPluginStore(): ClientPluginStore {
  const metadata: KeyValueStorage = window.localStorage;
  const storage = (navigator as Navigator & { storage?: OpfsStorage }).storage;
  const files: FileStorage = typeof storage?.getDirectory === "function"
    ? new OpfsFileStorage(storage.getDirectory.bind(storage))
    : new MemoryFileStorage();
  return new ClientPluginStore(metadata, files);
}

export function temporaryPluginStore(): ClientPluginStore {
  return new ClientPluginStore(createMemoryKeyValueStorage(), new MemoryFileStorage());
}
