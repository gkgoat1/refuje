# Phase 5 task 2 — key and shielded-fund integration

## 1. Where this task sits

- **Phase**: Phase 5 Add RAILGUN as a separate Cookbook system; goal: explicit movement between keys and shielded funds.
- **Moves**: R-4 RAILGUN system integration.
- **Starts after**: RailgunRecipeApi; **waits on**: direct recipe ports.

## 2. What the developer needs to know

**Read first**

- `RECIPE_SYSTEM_PLAN.md` — integration adapter boundary and dual-state recording.
- `src/recipes/refuje.ts` — Refuje balance plan output.
- `src/recipes/orchestrator.ts` — cross-stage execution conventions.

**Settled**

- Integration is explicit and auditable.
- Refuje keys are balances; RAILGUN notes are UTXOs.
- The adapter records both systems' identifiers and states.

**Edges and seam**

- Touches the integration adapter only.
- Seam: key-to-shield and shield-to-key transfer recipes.

**Run**

- `npm run test:recipes`; `npm run build:web`.

**Unknowns**

- Exact shield/unshield contract calls. Model them as Refuje call blobs first.

## 3. The workflow

1. Read this brief and restate the integration task in one line.
2. Define key-to-shield and shield-to-key input types.
3. Build the two-stage plan: Refuje withdrawal plus shield call.
4. Record both systems' identifiers in the plan metadata.
5. Add success and failure fixtures for each direction.
6. Run phase checks and commit the phase work.

## 4. The test cases

| Case | Input | Expected | Seam |
|---|---|---|---|
| 1 | key to shielded | withdrawal plus shield call | integration adapter |
| 2 | shielded to key | unshield plus deposit call | integration adapter |
| 3 | missing destination | validation error | integration adapter |
| 4 | one system fails | recovery state in metadata | integration adapter |
| 5 | fee on both legs | fees visible in both flows | integration adapter |
