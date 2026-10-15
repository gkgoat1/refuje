import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { defineConfig } from "vite";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root,
  build: {
    outDir: resolve(root, "../dist/web"),
    emptyOutDir: true,
  },
});
