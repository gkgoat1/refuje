# Phase 1 task 3 — dynamic module graph loader

## 1. Where this task sits

- **Phase**: Phase 1 Prove consented dynamic Web Worker loading; goal: load a consented dependency graph.
- **Moves**: R-2 Dynamic Web Worker plugin loading and R-6 Versioned, testable plugin integrations.
- **Starts after**: Worker bootstrap and package types; **waits on**: headless installation.

## 2. What the developer needs to know

**Read first**

- `RECIPE_SYSTEM_PLAN.md` — dynamic ESM graph and consent boundary.
- `package-lock.json` — existing ESM tooling and browser dependencies.
- `web/vite.config.ts` — bundling constraints for Worker modules.

**Settled**

- Local package modules are stored in OPFS before loading.
- The user consents before the graph is imported.
- A plugin may have multiple ESM modules and dependencies.

**Edges and seam**

- Touches package storage, module URL creation, and Worker import handling.
- Seam: package graph to plugin activation.

**Run**

- `npm run build:web`; run graph fixtures for imports, cycles, and missing modules.

**Unknowns**

- Relative import rewriting for OPFS-backed modules. Stop if the loader cannot preserve ESM semantics.

## 3. The workflow

1. Read this brief and restate the loader task in one line.
2. Define graph normalization and module identifier rules.
3. Materialize module sources as Worker-loadable module URLs.
4. Resolve static dependency edges and reject missing modules.
5. Import the entry module only after consent and Worker readiness.
6. Add graph fixtures and commit the phase work after the full phase passes.

## 4. The test cases

| Case | Input | Expected | Seam |
|---|---|---|---|
| 1 | entry plus one dependency | plugin activates | graph loader |
| 2 | missing dependency | load rejects before activation | graph loader |
| 3 | cyclic graph | cycle follows ESM rules | graph loader |
| 4 | module with Node import | load rejects or remains unavailable | Worker loader |
| 5 | second plugin graph | first graph is not visible | Worker lifecycle |
