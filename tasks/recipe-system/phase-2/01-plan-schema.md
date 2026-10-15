# Phase 2 task 1 — plan schema

## 1. Where this task sits

- **Phase**: Phase 2 Establish the recipe contract and policy gate; goal: produce a deterministic reviewable plan.
- **Moves**: R-1 Recipe contract and validation and R-6 Versioned, testable plugin integrations.
- **Starts after**: Phase 1 plugin loading; **waits on**: validation and policy rules.

## 2. What the developer needs to know

**Read first**

- `RECIPE_SYSTEM_PLAN.md` — recipe, plan, and plugin API boundaries.
- `src/recipes/types.ts` — existing plugin and client types.
- `src/Refuje.sol` — supported call shapes and asset entry points.

**Settled**

- Plans are serializable and UI-independent.
- Refuje balances and RAILGUN UTXOs remain separate.
- Every plan carries plugin and schema versions.

**Edges and seam**

- Touches only common recipe plan types.
- Seam: plan compiler input and normalized output.

**Run**

- `npm run test:recipes`; `npm run build:web`.

**Unknowns**

- Whether the first plan needs NFT fields. Keep the schema extensible without adding behavior.

## 3. The workflow

1. Read this brief and restate the schema task in one line.
2. Define asset, call, approval, output, constraint, and plan types.
3. Add schema and plugin API version fields.
4. Normalize optional arrays and metadata deterministically.
5. Add fixed serialization fixtures.
6. Run phase tests and commit the phase work.

## 4. The test cases

| Case | Input | Expected | Seam |
|---|---|---|---|
| 1 | one native call | stable serialized plan | plan compiler |
| 2 | ERC-20 call and approval | both appear in order | plan compiler |
| 3 | missing schema version | rejected | plan parser |
| 4 | reordered metadata | same normalized output | plan normalizer |
| 5 | balance and UTXO fields | models remain distinct | plan schema |
