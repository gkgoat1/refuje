# Phase 6 task 1 — public headless API

## 1. Where this task sits

- **Phase**: Phase 6 Expose, observe, and harden the client APIs; goal: callers can use the system without the UI.
- **Moves**: R-7 Headless client APIs and client-owned state.
- **Starts after**: Phase 5 systems and integration; **waits on**: UI adapter.

## 2. What the developer needs to know

**Read first**

- `RECIPE_SYSTEM_PLAN.md` — headless API boundary and UI adapter role.
- `src/recipes/client.ts` — current lifecycle and planning client.
- `src/recipes/orchestrator.ts` — execution and recovery surface.

**Settled**

- The public API is the only supported integration path.
- The web console is an adapter over the same API.
- All inputs and outputs are serializable.

**Edges and seam**

- Touches the public client entry point and export surface.
- Seam: caller-facing client methods.

**Run**

- `npm run test:recipes`; `npm run build:web`.

**Unknowns**

- The API may need a single convenience factory. Keep it thin and injectable.

## 3. The workflow

1. Read this brief and restate the public API task in one line.
2. Define the top-level client interface and convenience factory.
3. Export install, load, plan, execute, observe, recover, unload, and uninstall.
4. Ensure every result is serializable.
5. Add a headless caller fixture.
6. Run phase checks and commit the phase work.

## 4. The test cases

| Case | Input | Expected | Seam |
|---|---|---|---|
| 1 | caller creates client | usable without DOM | public API |
| 2 | caller plans a recipe | serializable plan | public API |
| 3 | caller executes a plan | execution state returns | public API |
| 4 | caller restores state | same execution continues | public API |
| 5 | caller unloads plugin | clean state | public API |
