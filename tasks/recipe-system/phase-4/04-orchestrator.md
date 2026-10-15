# Phase 4 task 4 — cross-chain orchestrator

## 1. Where this task sits

- **Phase**: Phase 4 Add Relay-backed cross-chain orchestration; goal: drive a swap through visible states.
- **Moves**: R-3 Refuje-native key and cross-chain recipes and R-7 Headless client APIs and client-owned state.
- **Starts after**: state, Relay, and bridge boundaries; **waits on**: recovery tests.

## 2. What the developer needs to know

**Read first**

- `RECIPE_SYSTEM_PLAN.md` — client-owned state and recovery requirements.
- `src/recipes/refuje.ts` — source plan compiler.
- `src/recipes/client.ts` — headless client conventions.

**Settled**

- The orchestrator never stores private keys or private notes.
- All transitions are serializable and idempotent.
- Browser restarts must not lose recovery state.

**Edges and seam**

- Touches orchestration and client-owned persistence only.
- Seam: state plus external event to next action.

**Run**

- `npm run test:recipes`; `npm run build:web`.

**Unknowns**

- A restarted client may see old Relay state before current state. Restore-before-update must be explicit.

## 3. The workflow

1. Read this brief and restate the orchestrator task in one line.
2. Define the client-owned execution store interface.
3. Implement start, observe, resume, retry, and cancel actions.
4. Wire Relay and bridge adapter events into guarded transitions.
5. Add restart, duplicate, and partial-completion tests.
6. Run phase checks and commit the phase work.

## 4. The test cases

| Case | Input | Expected | Seam |
|---|---|---|---|
| 1 | new cross-chain plan | source action returns | orchestrator |
| 2 | restored pending state | same or later state | orchestrator |
| 3 | duplicate event | no state change | orchestrator |
| 4 | destination rejection | recovery action returns | orchestrator |
| 5 | spent authorization | replay is rejected | orchestrator |
