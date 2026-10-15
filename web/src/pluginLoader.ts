import { init, parse } from "es-module-lexer";
import type { RecipePluginPackage } from "../../src/recipes/types.ts";

export interface MaterializedModules {
  entryUrl: string;
  urls: string[];
}

export async function materializeModuleGraph(plugin: RecipePluginPackage): Promise<MaterializedModules> {
  await init;
  const urls = new Map<string, string>();
  const visiting = new Set<string>();

  const visit = async (moduleId: string): Promise<string> => {
    const existing = urls.get(moduleId);
    if (existing) return existing;
    if (visiting.has(moduleId)) throw new Error(`Cyclic plugin dependency: ${moduleId}`);
    const module = plugin.modules[moduleId];
    if (!module) throw new Error(`Missing plugin module: ${moduleId}`);
    visiting.add(moduleId);
    const imports = parse(module.source)[0];
    const replacements: Array<{ start: number; end: number; value: string }> = [];
    for (const imported of imports) {
      const specifier = imported.specifier;
      if (!specifier) continue;
      const targetId = module.imports?.[specifier];
      if (!targetId) throw new Error(`Undeclared plugin import ${specifier} in ${moduleId}`);
      const targetUrl = await visit(targetId);
      replacements.push({ start: imported.start, end: imported.end, value: targetUrl });
    }
    let source = module.source;
    for (const replacement of replacements.sort((a, b) => b.start - a.start)) {
      source = `${source.slice(0, replacement.start)}${replacement.value}${source.slice(replacement.end)}`;
    }
    const url = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
    urls.set(moduleId, url);
    visiting.delete(moduleId);
    return url;
  };

  const entryUrl = await visit(plugin.manifest.entry);
  return { entryUrl, urls: [...urls.values()] };
}

export function releaseModuleGraph(materialized: MaterializedModules): void {
  for (const url of materialized.urls) URL.revokeObjectURL(url);
}
