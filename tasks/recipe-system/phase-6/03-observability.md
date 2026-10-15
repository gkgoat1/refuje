# Phase 6 task 3 — observability

## 1. Where this task sits

- **Phase**: Phase 6 Expose, observe, and harden the client APIs; goal: make execution and failure visible.
- **Moves**: R-7 Headless client APIs and client-owned state.
- **Starts after**: public API and UI adapter; **waits on**: revocation and hardening.

## 2. What the developer needs to know

**Read first**

- `RECIPE_SYSTEM_PLAN.md` — structured logs, correlation IDs, metrics, and redacted failures.
- `src/recipes/orchestrator.ts` — execution history and state.
- `src/recipes/client.ts` — plugin lifecycle and status.

**Settled**

- Logs are client-owned and serializable.
- Correlation IDs link a plan to its execution.
- Private notes and keys are never logged.

**Edges and seam**

- Touches execution logging and metrics only.
- Seam: execution event to structured log entry.

**Run**

- `npm run test:recipes`; `npm run build:web`.

**Unknowns**

- Log volume in the browser. Use ring buffers or storage adapters.

## 3. The workflow

1. Read this brief and restate the observability task in one line.
2. Define log entry, correlation ID, and metric types.
3. Record plan, plugin, execution, and policy events.
4. Redact secrets and private notes before writing.
5. Add a client-owned log store and retrieval.
6. Run phase checks and commit the phase work.

## 4. The test cases

| Case | Input | Expected | Seam |
|---|---|---|---|
| 1 | plan generated | log entry with correlation ID | observability |
| 2 | execution submitted | log entry with Relay ID | observability |
| 3 | policy rejection | redacted failure entry | observability |
| 4 | plugin unload | lifecycle entry | observability |
| 5 | query by execution | all related entries return | observability |
