# Phase 1 task 5 — isolation and cleanup tests

## 1. Where this task sits

- **Phase**: Phase 1 Prove consented dynamic Web Worker loading; goal: prove clean plugin replacement.
- **Moves**: R-2 Dynamic Web Worker plugin loading and R-6 Versioned, testable plugin integrations.
- **Starts after**: the lifecycle API; **waits on**: Phase 2 recipe execution.

## 2. What the developer needs to know

**Read first**

- `RECIPE_SYSTEM_PLAN.md` — cleanup and one-Worker-per-plugin decisions.
- Phase 1 Worker protocol and client modules — lifecycle messages and ownership.
- Existing Forge and TypeScript test scripts — compatible test entry points.

**Settled**

- A Worker is terminated on unload, replacement, timeout, or cancellation.
- Plugin state is never shared between plugin instances.
- The browser may retain persistent package data only when the user chose persistence.

**Edges and seam**

- Touches only the Worker lifecycle and storage fakes.
- Seam: sequential plugin lifecycle tests.

**Run**

- `npm run build:web`; run the isolation harness and existing Forge tests.

**Unknowns**

- Browser-only cleanup APIs may need a fake in Node. Keep the production path explicit.

## 3. The workflow

1. Read this brief and restate the isolation task in one line.
2. Add a plugin that records module and message state.
3. Load and run plugin A, then unload it.
4. Load plugin B and assert no A state is visible.
5. Exercise cancellation, timeout, and temporary-install cleanup.
6. Run all phase checks and commit the phase.

## 4. The test cases

| Case | Input | Expected | Seam |
|---|---|---|---|
| 1 | plugin A then plugin B | B sees a clean environment | lifecycle harness |
| 2 | unload during run | no later message mutates state | lifecycle harness |
| 3 | temporary package | package disappears on cleanup | storage fake |
| 4 | persistent package | package survives reload | storage fake |
| 5 | failed plugin import | Worker and object URLs are released | lifecycle harness |
