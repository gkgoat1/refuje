# Phase 5 task 3 — direct Refuje recipe ports

## 1. Where this task sits

- **Phase**: Phase 5 Add RAILGUN as a separate Cookbook system; goal: port useful Cookbook recipes to Refuje balances.
- **Moves**: R-3 Refuje-native key and cross-chain recipes and R-6 Versioned, testable plugin integrations.
- **Starts after**: RailgunRecipeApi and integration adapter; **waits on**: phase proof.

## 2. What the developer needs to know

**Read first**

- `RECIPE_SYSTEM_PLAN.md` — port all Cookbook recipes where balance execution works.
- `src/recipes/refuje.ts` — direct recipe factory.
- RAILGUN Cookbook catalog — Steps, Recipes, and Combo Meals to port.

**Settled**

- Every port uses RefujeRecipeApi, not RailgunRecipeApi.
- A port keeps the same user intention but uses balance authorization.
- Ports are versioned independently from the RAILGUN plugin.

**Edges and seam**

- Touches a catalog of direct Refuje recipe definitions.
- Seam: Cookbook recipe name to Refuje plan builder.

**Run**

- `npm run test:recipes`; `npm run build:web`.

**Unknowns**

- Some Cookbook recipes may not map to balances. Record them as RAILGUN-only.

## 3. The workflow

1. Read this brief and restate the port task in one line.
2. Enumerate the Cookbook recipe catalog to port.
3. For each recipe, define the Refuje balance equivalent.
4. Add approval, call, and output steps per recipe.
5. Mark any recipe that requires UTXOs as RAILGUN-only.
6. Run phase checks and commit the phase work.

## 4. The test cases

| Case | Input | Expected | Seam |
|---|---|---|---|
| 1 | swap recipe port | Refuje balance plan | port catalog |
| 2 | vault deposit port | Refuje balance plan | port catalog |
| 3 | combo meal port | combined Refuje plan | port catalog |
| 4 | UTXO-only recipe | marked RAILGUN-only | port catalog |
| 5 | repeated port build | stable plan output | port catalog |
