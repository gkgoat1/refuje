# Phase 4 task 1 — execution state model

## 1. Where this task sits

- **Phase**: Phase 4 Add Relay-backed cross-chain orchestration; goal: make source, Relay, destination, and recovery visible.
- **Moves**: R-3 Refuje-native key and cross-chain recipes and R-7 Headless client APIs and client-owned state.
- **Starts after**: Phase 3 Refuje balance plans; **waits on**: Relay and bridge adapters.

## 2. What the developer needs to know

**Read first**

- `RECIPE_SYSTEM_PLAN.md` — client-owned state and non-atomic cross-chain boundary.
- `src/recipes/plan.ts` — serialized plan shape.
- `src/recipes/store.ts` — storage adapter conventions.

**Settled**

- State is owned by the client.
- Cross-chain execution is asynchronous and recoverable.
- A key authorization cannot be replayed.

**Edges and seam**

- Touches execution state types and serialization only.
- Seam: state transition reducer.

**Run**

- `npm run test:recipes`; `npm run build:web`.

**Unknowns**

- Relay statuses may be richer than the first state model. Preserve raw provider details.

## 3. The workflow

1. Read this brief and restate the state task in one line.
2. Define source, Relay, destination, settled, and recoverable states.
3. Add transition guards and idempotency keys.
4. Serialize and restore state without secrets.
5. Add duplicate and out-of-order transition fixtures.
6. Run phase checks and commit the phase work.

## 4. The test cases

| Case | Input | Expected | Seam |
|---|---|---|---|
| 1 | planned execution | source can submit | reducer |
| 2 | duplicate source event | state unchanged | reducer |
| 3 | destination rejection | recoverable state | reducer |
| 4 | restored state | same next action | serializer |
| 5 | invalid transition | typed rejection | reducer |
