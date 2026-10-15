# Phase 4 task 3 — bridge boundary

## 1. Where this task sits

- **Phase**: Phase 4 Add Relay-backed cross-chain orchestration; goal: isolate protocol transport from recipe planning.
- **Moves**: R-3 Refuje-native key and cross-chain recipes and R-5 Safe contract execution.
- **Starts after**: Relay adapter; **waits on**: orchestration tests.

## 2. What the developer needs to know

**Read first**

- `RECIPE_SYSTEM_PLAN.md` — no atomic cross-chain promise.
- `src/recipes/refuje.ts` — source Refuje plan output.
- `src/recipes/policy.ts` — target and selector policy gate.

**Settled**

- The first bridge protocol remains open.
- The bridge adapter is protocol-specific and replaceable.
- Destination settlement is a separate stage.

**Edges and seam**

- Touches bridge adapter types and mocked transport only.
- Seam: source-confirmed event to destination intent.

**Run**

- `npm run test:recipes`; `npm run build:web`.

**Unknowns**

- Bridge status vocabulary varies. Normalize only the states the client can act on.

## 3. The workflow

1. Read this brief and restate the bridge task in one line.
2. Define bridge request, receipt, status, and recovery types.
3. Normalize source chain, destination chain, token, amount, and expiry.
4. Map bridge status events to execution state transitions.
5. Add duplicate, reordered, failed, and timed-out events.
6. Run phase checks and commit the phase work.

## 4. The test cases

| Case | Input | Expected | Seam |
|---|---|---|---|
| 1 | source-confirmed receipt | bridge pending | bridge mapper |
| 2 | duplicate receipt | no duplicate intent | bridge mapper |
| 3 | destination-ready event | destination intent returns | bridge mapper |
| 4 | bridge failure | recovery state | bridge mapper |
| 5 | out-of-order event | state stays safe | bridge mapper |
