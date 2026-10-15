# Phase 1 task 4 — headless plugin API

## 1. Where this task sits

- **Phase**: Phase 1 Prove consented dynamic Web Worker loading; goal: expose plugin lifecycle without a UI.
- **Moves**: R-7 Headless client APIs and client-owned state.
- **Starts after**: bootstrap and module graph loading; **waits on**: later recipe planning.

## 2. What the developer needs to know

**Read first**

- `RECIPE_SYSTEM_PLAN.md` — the UI is an adapter, not the execution boundary.
- `src/index.ts` — current headless TypeScript export style.
- `web/src/main.ts` — current UI state that must not leak into the API.

**Settled**

- APIs must run without DOM globals.
- Install, load, run, unload, and status are public operations.
- Execution state belongs to the caller.

**Edges and seam**

- Touches the public recipe client and Worker bridge.
- Seam: a plain JavaScript client invoking lifecycle operations.

**Run**

- `npm run build:web`; run the headless client harness without a browser DOM.

**Unknowns**

- Whether the current Node test runner can construct Worker objects. Use a protocol fake if needed.

## 3. The workflow

1. Read this brief and restate the API task in one line.
2. Define the client interface around install, load, run, unload, and status.
3. Return serializable plugin and execution state.
4. Keep consent callbacks and storage adapters injectable.
5. Add a UI-independent lifecycle fixture.
6. Run typecheck and the harness, then commit the phase work.

## 4. The test cases

| Case | Input | Expected | Seam |
|---|---|---|---|
| 1 | package and consent callback | install succeeds | headless client |
| 2 | consent rejection | no Worker starts | headless client |
| 3 | run loaded plugin | serializable result returns | headless client |
| 4 | unload plugin | status becomes unloaded | headless client |
| 5 | restored client state | installed package is discoverable | storage adapter |
