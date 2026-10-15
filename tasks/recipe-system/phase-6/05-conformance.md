# Phase 6 task 5 — conformance suite

## 1. Where this task sits

- **Phase**: Phase 6 Expose, observe, and harden the client APIs; goal: prove all supported systems together.
- **Moves**: R-6 Versioned, testable plugin integrations and R-5 Safe contract execution.
- **Starts after**: revocation and observability; **waits on**: nothing.

## 2. What the developer needs to know

**Read first**

- `RECIPE_SYSTEM_PLAN.md` — conformance fixtures, Worker isolation, and full test suite.
- `test/recipes.test.ts` — current headless test coverage.
- `test/Refuje.t.sol` — existing contract e2e coverage.

**Settled**

- Every supported system has deterministic fixtures.
- Worker isolation and cleanup are tested.
- The full Forge suite remains green.

**Edges and seam**

- Touches conformance fixtures and test orchestration.
- Seam: full recipe-system test suite.

**Run**

- `npm run test:recipes`; `npm run test:forge`; `npm run test:halmos`; `npm run build:web`.

**Unknowns**

- Halmos runs are slow. Keep them in the existing symbolic suite only.

## 3. The workflow

1. Read this brief and restate the conformance task in one line.
2. Add a conformance runner that exercises every plugin family.
3. Add Worker isolation and cleanup assertions.
4. Add policy, replay, and revocation conformance cases.
5. Run the full recipe, Forge, and web checks.
6. Commit the phase.

## 4. The test cases

| Case | Input | Expected | Seam |
|---|---|---|---|
| 1 | every plugin family | all fixtures pass | conformance |
| 2 | sequential plugin loads | no state crossing | Worker isolation |
| 3 | policy violation | stable rejection | conformance |
| 4 | replay attempt | typed rejection | conformance |
| 5 | full suite | Forge and web green | conformance |
