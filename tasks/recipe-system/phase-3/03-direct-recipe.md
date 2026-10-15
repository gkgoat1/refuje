# Phase 3 task 3 — direct Refuje recipe factory

## 1. Where this task sits

- **Phase**: Phase 3 Ship Refuje-native Cookbook systems; goal: support direct balance recipes.
- **Moves**: R-3 Refuje-native key and cross-chain recipes and R-6 Versioned, testable plugin integrations.
- **Starts after**: withdrawal compiler; **waits on**: plugin fixtures.

## 2. What the developer needs to know

**Read first**

- `RECIPE_SYSTEM_PLAN.md` — all Cookbook recipes are candidates for direct Refuje ports.
- `src/recipes/plan.ts` — plan fields and deterministic normalization.
- `src/recipes/client.ts` — plugin lifecycle and headless planning.

**Settled**

- Direct ports use RefujeRecipeApi and balances.
- A recipe factory returns a plan builder, not a UI component.
- Protocol-specific calls pass through the common policy gate.

**Edges and seam**

- Touches reusable direct-recipe definitions.
- Seam: recipe definition to normalized plan.

**Run**

- `npm run test:recipes`; `npm run build:web`.

**Unknowns**

- Cookbook recipes vary in approvals and outputs. Keep the factory generic.

## 3. The workflow

1. Read this brief and restate the factory task in one line.
2. Define a direct recipe descriptor and input schema.
3. Build approval, call, and output-flow steps.
4. Compile through the common normalizer and policy gate.
5. Add one protocol-shaped fixture without naming a production bridge.
6. Run phase checks and commit the phase work.

## 4. The test cases

| Case | Input | Expected | Seam |
|---|---|---|---|
| 1 | direct ERC-20 call | balance plan | recipe factory |
| 2 | required approval | bounded approval | recipe factory |
| 3 | output minimum | constraint survives | recipe factory |
| 4 | undeclared target | policy rejection | recipe factory |
| 5 | repeated build | stable plan | recipe factory |
