import { RecipeClient, type RecipeClientOptions, type WorkerFactory } from "../../src/recipes/index.ts";
import { browserPluginStore, temporaryPluginStore } from "./opfs.ts";

const browserWorkers: WorkerFactory = {
  create() {
    return new Worker(new URL("./recipeWorker.ts", import.meta.url), { type: "module" });
  },
};

export function createBrowserRecipeClient(options: Omit<RecipeClientOptions, "workerFactory" | "store"> & { temporary?: boolean } = {}): RecipeClient {
  return new RecipeClient({
    ...options,
    workerFactory: browserWorkers,
    store: options.temporary ? temporaryPluginStore() : browserPluginStore(),
  });
}

export async function readPluginPackage(file: File): Promise<unknown> {
  try {
    return JSON.parse(await file.text());
  } catch (error) {
    throw new Error(`Could not read plugin package ${file.name}`, { cause: error });
  }
}
