# Phase 5 task 1 — Railgun UTXO API

## 1. Where this task sits

- **Phase**: Phase 5 Add RAILGUN as a separate Cookbook system; goal: RAILGUN recipes use their UTXO API.
- **Moves**: R-4 RAILGUN system integration and R-6 Versioned, testable plugin integrations.
- **Starts after**: Phase 4 orchestration; **waits on**: key-to-shielded transfers.

## 2. What the developer needs to know

**Read first**

- `RECIPE_SYSTEM_PLAN.md` — separate RefujeRecipeApi and RailgunRecipeApi.
- `docs.railgun.org` — Cookbook Steps, Recipes, Combo Meals, unshield, shield, clean-slate approvals.
- `src/recipes/plan.ts` — shared plan schema used by both APIs.

**Settled**

- RAILGUN uses UTXOs, not balances.
- Proving is client-side.
- RAILGUN is an optional system plugin.

**Edges and seam**

- Touches RailgunRecipeApi and UTXO types only.
- Seam: RAILGUN recipe input to normalized plan.

**Run**

- `npm run test:recipes`; `npm run build:web`.

**Unknowns**

- The exact Cookbook package API may change. Pin the version and wrap it in the adapter.

## 3. The workflow

1. Read this brief and restate the RAILGUN API task in one line.
2. Define UTXO, shield, unshield, and proof-input types.
3. Model a RAILGUN recipe as unshield → calls → re-shield.
4. Return a plan that keeps UTXO fields separate from Refuje balance fields.
5. Add a known RAILGUN-shaped fixture.
6. Run phase checks and commit the phase work.

## 4. The test cases

| Case | Input | Expected | Seam |
|---|---|---|---|
| 1 | UTXO shield input | shield plan with UTXO flows | RailgunRecipeApi |
| 2 | UTXO unshield input | unshield plan with UTXO flows | RailgunRecipeApi |
| 3 | balance-only input | rejected by RAILGUN API | RailgunRecipeApi |
| 4 | clean-slate approval | approval step included | RailgunRecipeApi |
| 5 | recipe with fees | fees visible in flows | RailgunRecipeApi |
