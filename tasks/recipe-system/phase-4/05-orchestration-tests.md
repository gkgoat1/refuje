# Phase 4 task 5 — orchestration proof

## 1. Where this task sits

- **Phase**: Phase 4 Add Relay-backed cross-chain orchestration; goal: prove success, retry, and recovery.
- **Moves**: R-3 Refuje-native key and cross-chain recipes and R-5 Safe contract execution.
- **Starts after**: the orchestrator; **waits on**: RAILGUN system integration.

## 2. What the developer needs to know

**Read first**

- `RECIPE_SYSTEM_PLAN.md` — Phase 4 proof requirements.
- `src/recipes/orchestrator.ts` — final state transition seam.
- `test/recipes.test.ts` — headless test style.

**Settled**

- Mocked transport is enough for this phase.
- The contract suite must remain green.
- No atomic cross-chain guarantee is claimed.

**Edges and seam**

- Touches orchestration fixtures and tests only.
- Seam: mocked two-chain execution.

**Run**

- `npm run test:recipes`; `forge test`; `npm run build:web`.

**Unknowns**

- Relay and bridge ordering can overlap. Assert only the accepted transitions.

## 3. The workflow

1. Read this brief and restate the proof task in one line.
2. Add a successful mocked source-to-destination run.
3. Add a retried Relay run.
4. Add a destination rejection and recovery run.
5. Assert no spent authorization is submitted twice.
6. Run phase checks and commit the phase.

## 4. The test cases

| Case | Input | Expected | Seam |
|---|---|---|---|
| 1 | happy path | settled state | orchestration test |
| 2 | Relay timeout then success | retried then settled | orchestration test |
| 3 | bridge failure | recoverable state | orchestration test |
| 4 | destination rejection | recovery plan | orchestration test |
| 5 | replay attempt | typed rejection | orchestration test |
