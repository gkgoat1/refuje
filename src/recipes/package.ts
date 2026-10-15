import type {
  ConsentRequest,
  PluginInstallOptions,
  PluginManifest,
  RecipePluginPackage,
} from "./types.ts";

const ID = /^[a-z][a-z0-9._-]{1,63}$/;
const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

function fail(message: string): never {
  throw new Error(`Invalid recipe plugin: ${message}`);
}

function stringValue(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) fail(`${field} must be a non-empty string`);
  return value;
}

function stringList(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.length === 0)) {
    fail(`${field} must be an array of non-empty strings`);
  }
  return [...value];
}

export function parsePluginPackage(value: unknown): RecipePluginPackage {
  if (!value || typeof value !== "object") fail("package must be an object");
  const record = value as Record<string, unknown>;
  const rawManifest = record.manifest;
  const rawModules = record.modules;
  if (!rawManifest || typeof rawManifest !== "object") fail("manifest is required");
  if (!rawModules || typeof rawModules !== "object" || Array.isArray(rawModules)) fail("modules are required");

  const manifestRecord = rawManifest as Record<string, unknown>;
  const manifest: PluginManifest = {
    format: manifestRecord.format === 1 ? 1 : fail("manifest format must be 1"),
    id: stringValue(manifestRecord.id, "manifest.id"),
    version: stringValue(manifestRecord.version, "manifest.version"),
    name: stringValue(manifestRecord.name, "manifest.name"),
    description: manifestRecord.description === undefined ? undefined : stringValue(manifestRecord.description, "manifest.description"),
    entry: stringValue(manifestRecord.entry, "manifest.entry"),
    capabilities: stringList(manifestRecord.capabilities, "manifest.capabilities"),
    dependencies: stringList(manifestRecord.dependencies, "manifest.dependencies"),
  };
  if (!ID.test(manifest.id)) fail("manifest.id has invalid characters");
  if (!VERSION.test(manifest.version)) fail("manifest.version must use semantic version syntax");

  const modules: RecipePluginPackage["modules"] = {};
  for (const [moduleId, rawModule] of Object.entries(rawModules)) {
    if (!moduleId || !rawModule || typeof rawModule !== "object") fail(`module ${moduleId} is invalid`);
    const moduleRecord = rawModule as Record<string, unknown>;
    const source = stringValue(moduleRecord.source, `module ${moduleId}.source`);
    const imports = moduleRecord.imports;
    if (imports !== undefined && (!imports || typeof imports !== "object" || Array.isArray(imports))) {
      fail(`module ${moduleId}.imports must be an object`);
    }
    const normalizedImports: Record<string, string> = {};
    for (const [specifier, target] of Object.entries((imports ?? {}) as Record<string, unknown>)) {
      normalizedImports[stringValue(specifier, `module ${moduleId} import`)] = stringValue(target, `module ${moduleId} import target`);
    }
    modules[moduleId] = { source, imports: normalizedImports };
  }

  if (!modules[manifest.entry]) fail("manifest.entry is not present in modules");
  for (const [moduleId, module] of Object.entries(modules)) {
    for (const target of Object.values(module.imports ?? {})) {
      if (!modules[target]) fail(`module ${moduleId} imports missing module ${target}`);
    }
  }

  return { manifest, modules };
}

export function consentRequest(plugin: RecipePluginPackage, options: PluginInstallOptions = {}): ConsentRequest {
  const lifetime = options.lifetime ?? "persistent";
  return {
    plugin: {
      id: plugin.manifest.id,
      version: plugin.manifest.version,
      name: plugin.manifest.name,
      description: plugin.manifest.description,
      capabilities: [...plugin.manifest.capabilities],
      dependencies: [...plugin.manifest.dependencies],
    },
    lifetime,
  };
}
