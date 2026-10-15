# Phase 3 task 5 — Refuje integration tests

## 1. Where this task sits

- **Phase**: Phase 3 Ship Refuje-native Cookbook systems; goal: prove a Refuje balance recipe end to end.
- **Moves**: R-1 Recipe contract and validation, R-3 Refuje-native key and cross-chain recipes, R-5 Safe contract execution, and R-7 Headless client APIs and client-owned state.
- **Starts after**: API, compiler, factory, and plugin fixture; **waits on**: Relay orchestration.

## 2. What the developer needs to know

**Read first**

- `test/Refuje.t.sol` — contract withdrawal and replay expectations.
- `test/recipes.test.ts` — headless plan tests.
- `src/recipes/refuje.ts` — final balance API seam.

**Settled**

- Tests must keep balances and UTXOs separate.
- Proofs are client inputs, not Worker secrets.
- Refuje calls use the existing misspelled ABI names.

**Edges and seam**

- Touches TypeScript plan fixtures and existing Forge behavior checks.
- Seam: headless Refuje recipe output.

**Run**

- `npm run test:recipes`; `forge test`; `npm run build:web`.

**Unknowns**

- Full proof execution is expensive. Keep compiler checks separate from existing Forge e2e coverage.

## 3. The workflow

1. Read this brief and restate the integration task in one line.
2. Add independent native and ERC-20 plan vectors.
3. Run policy checks over both vectors.
4. Compare calldata with existing client behavior.
5. Run Forge and web checks.
6. Commit the phase.

## 4. The test cases

| Case | Input | Expected | Seam |
|---|---|---|---|
| 1 | native vector | exact Refuje call | integration |
| 2 | ERC-20 vector | exact Refuje call | integration |
| 3 | replayed proof | host plan remains deterministic | integration |
| 4 | missing policy | execution plan rejected | integration |
| 5 | Forge contract suite | existing behavior remains green | integration |
