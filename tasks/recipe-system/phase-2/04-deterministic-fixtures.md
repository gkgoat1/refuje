# Phase 2 task 4 — deterministic fixtures

## 1. Where this task sits

- **Phase**: Phase 2 Establish the recipe contract and policy gate; goal: make plan behavior replayable.
- **Moves**: R-1 Recipe contract and validation, R-5 Safe contract execution, and R-6 Versioned, testable plugin integrations.
- **Starts after**: schema, validation, and policy; **waits on**: phase proof.

## 2. What the developer needs to know

**Read first**

- `RECIPE_SYSTEM_PLAN.md` — conformance and replay requirements.
- `test/recipes.test.ts` — current headless test style.
- `test/Refuje.t.sol` — existing contract behavior fixtures.

**Settled**

- Fixtures must use independent expected values.
- Plans must be safe to replay without signing.
- Policy failures are part of the public result.

**Edges and seam**

- Touches recipe fixtures and conformance helpers.
- Seam: serialized plan and policy result.

**Run**

- `npm run test:recipes`; `npm run test:forge`; `npm run build:web`.

**Unknowns**

- Existing target helpers may encode protocol-specific assumptions. Keep fixtures explicit.

## 3. The workflow

1. Read this brief and restate the fixture task in one line.
2. Add known native and ERC-20 plan fixtures.
3. Add invalid policy fixtures with independent rejection reasons.
4. Add schema and plugin-version compatibility cases.
5. Run TypeScript and Forge checks.
6. Commit the phase work.

## 4. The test cases

| Case | Input | Expected | Seam |
|---|---|---|---|
| 1 | known native plan | exact serialized bytes | conformance fixture |
| 2 | known ERC-20 plan | exact calls and approvals | conformance fixture |
| 3 | policy violation | stable rejection code | policy result |
| 4 | incompatible version | clear compatibility error | schema gate |
| 5 | replayed plan | same normalized output | plan compiler |
