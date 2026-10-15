# Phase 5 task 4 — RAILGUN system plugin

## 1. Where this task sits

- **Phase**: Phase 5 Add RAILGUN as a separate Cookbook system; goal: run RAILGUN recipes as an optional plugin.
- **Moves**: R-2 Dynamic Web Worker plugin loading and R-4 RAILGUN system integration.
- **Starts after**: RailgunRecipeApi and integration adapter; **waits on**: phase proof.

## 2. What the developer needs to know

**Read first**

- `src/recipes/types.ts` — plugin activation contract.
- `web/src/recipeWorker.ts` — dynamic module loading boundary.
- RAILGUN Cookbook docs — proving and Relay submission flow.

**Settled**

- The RAILGUN plugin is optional and separate from Refuje.
- Proving is client-side, inside or alongside the Worker.
- Private notes never leave the client.

**Edges and seam**

- Touches the RAILGUN plugin package and Worker activation.
- Seam: plugin manifest to RAILGUN recipe plan.

**Run**

- `npm run test:recipes`; `npm run build:web`.

**Unknowns**

- Cookbook proving may exceed Worker resource limits. Keep proving on the main thread if needed.

## 3. The workflow

1. Read this brief and restate the RAILGUN plugin task in one line.
2. Define the RAILGUN plugin manifest and dependency graph.
3. Wire RailgunRecipeApi into the plugin activation.
4. Load the plugin through consent and a fresh Web Worker.
5. Run a UTXO recipe through the plugin.
6. Run phase checks and commit the phase work.

## 4. The test cases

| Case | Input | Expected | Seam |
|---|---|---|---|
| 1 | RAILGUN plugin install | Worker loads and runs | plugin lifecycle |
| 2 | UTXO recipe input | RAILGUN plan output | plugin runtime |
| 3 | proving on main thread | Worker does not hold notes | capability boundary |
| 4 | unload plugin | Worker terminates | lifecycle host |
| 5 | second plugin | no RAILGUN state visible | Worker isolation |
