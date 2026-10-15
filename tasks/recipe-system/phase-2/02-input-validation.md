# Phase 2 task 2 — typed input validation

## 1. Where this task sits

- **Phase**: Phase 2 Establish the recipe contract and policy gate; goal: reject invalid intent before signing.
- **Moves**: R-1 Recipe contract and validation.
- **Starts after**: the plan schema; **waits on**: policy gate and fixtures.

## 2. What the developer needs to know

**Read first**

- `RECIPE_SYSTEM_PLAN.md` — required chain, token, amount, slippage, and deadline checks.
- `src/recipes/types.ts` — package and version conventions.
- `src/index.ts` — existing byte and address handling conventions.

**Settled**

- Validation runs before signing or Relay submission.
- Amounts use bigint-safe decimal handling.
- Chain and contract addresses are explicit plan inputs.

**Edges and seam**

- Touches the common validator and normalizer.
- Seam: typed recipe input to validation result.

**Run**

- `npm run test:recipes`; `npm run build:web`.

**Unknowns**

- Token decimals may be unavailable. Require explicit decimals rather than guessing.

## 3. The workflow

1. Read this brief and restate the validation task in one line.
2. Validate chain IDs, addresses, token decimals, and integer amounts.
3. Validate deadline, slippage, recipient, and minimum-output constraints.
4. Return structured errors without partially normalized calls.
5. Add boundary and malformed-input fixtures.
6. Run phase tests and commit the phase work.

## 4. The test cases

| Case | Input | Expected | Seam |
|---|---|---|---|
| 1 | valid chain and address | validation passes | validator |
| 2 | wrong chain | validation fails | validator |
| 3 | amount above limit | validation fails | validator |
| 4 | expired deadline | validation fails | validator |
| 5 | invalid slippage | validation fails | validator |
