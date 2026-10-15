# Phase 3 task 1 — Refuje balance API

## 1. Where this task sits

- **Phase**: Phase 3 Ship Refuje-native Cookbook systems; goal: run balance recipes without the UI or RAILGUN.
- **Moves**: R-3 Refuje-native key and cross-chain recipes and R-7 Headless client APIs and client-owned state.
- **Starts after**: Phase 2 plan and policy contract; **waits on**: withdrawal compilation.

## 2. What the developer needs to know

**Read first**

- `RECIPE_SYSTEM_PLAN.md` — RefujeRecipeApi and balance boundary.
- `src/Refuje.sol` — withdrawal entry points and argument order.
- `src/recipes/plan.ts` — normalized calls and asset flows.

**Settled**

- Refuje uses balance-based key authorization.
- RAILGUN is not imported into this API.
- The API returns plans, not signed transactions.

**Edges and seam**

- Touches the RefujeRecipeApi and balance asset types.
- Seam: typed Refuje input to RecipePlan.

**Run**

- `npm run test:recipes`; `npm run build:web`.

**Unknowns**

- Existing target encoding may need explicit hex normalization. Reuse known client conventions.

## 3. The workflow

1. Read this brief and restate the Refuje API task in one line.
2. Define key, asset, chain, and instance inputs.
3. Compile balance flows without UTXO fields.
4. Return serializable plans and structured validation errors.
5. Add native and ERC-20 fixtures.
6. Run phase checks and commit the phase work.

## 4. The test cases

| Case | Input | Expected | Seam |
|---|---|---|---|
| 1 | native key balance | native flow plan | RefujeRecipeApi |
| 2 | ERC-20 key balance | token flow plan | RefujeRecipeApi |
| 3 | UTXO-only input | rejected | RefujeRecipeApi |
| 4 | wrong Refuje instance | validation error | RefujeRecipeApi |
| 5 | missing chain | validation error | RefujeRecipeApi |
