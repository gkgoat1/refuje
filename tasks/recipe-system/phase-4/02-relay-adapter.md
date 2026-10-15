# Phase 4 task 2 — Relay adapter

## 1. Where this task sits

- **Phase**: Phase 4 Add Relay-backed cross-chain orchestration; goal: submit and observe transactions through Relay.
- **Moves**: R-3 Refuje-native key and cross-chain recipes.
- **Starts after**: execution state; **waits on**: cross-chain orchestration.

## 2. What the developer needs to know

**Read first**

- `RECIPE_SYSTEM_PLAN.md` — Relay is the selected execution authority.
- `web/src/main.ts` — current raw transaction and provider conventions.
- `src/recipes/types.ts` — Worker-independent public client boundary.

**Settled**

- The adapter is headless and injectable.
- Relay submission and Relay status are separate calls.
- Provider-specific errors become typed execution errors.

**Edges and seam**

- Touches a Relay client interface and a mocked implementation.
- Seam: plan transaction envelope to Relay submission.

**Run**

- `npm run test:recipes`; `npm run build:web`.

**Unknowns**

- The first production Relay environment remains open; do not hard-code one.

## 3. The workflow

1. Read this brief and restate the Relay task in one line.
2. Define submission, status, and cancellation requests.
3. Normalize Relay transaction IDs and provider details.
4. Add a deterministic mocked Relay for tests.
5. Add submission, retry, timeout, and failed-status fixtures.
6. Run phase checks and commit the phase work.

## 4. The test cases

| Case | Input | Expected | Seam |
|---|---|---|---|
| 1 | valid envelope | Relay ID returns | Relay adapter |
| 2 | duplicate idempotency key | existing execution returns | Relay adapter |
| 3 | Relay failure | typed recoverable error | Relay adapter |
| 4 | status after submit | source-confirmed event | Relay adapter |
| 5 | timed-out status | recoverable state | Relay adapter |
