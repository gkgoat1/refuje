# Phase 1 task 2 — Worker bootstrap

## 1. Where this task sits

- **Phase**: Phase 1 Prove consented dynamic Web Worker loading; goal: isolate one plugin instance.
- **Moves**: R-2 Dynamic Web Worker plugin loading.
- **Starts after**: the plugin contract; **waits on**: module loading and lifecycle APIs.

## 2. What the developer needs to know

**Read first**

- `RECIPE_SYSTEM_PLAN.md` — one fresh Worker per plugin and cleanup boundary.
- `web/vite.config.ts` — current Vite worker build boundary.
- `web/src/main.ts` — current UI event and provider patterns.

**Settled**

- Use a dedicated Web Worker, never a shared Worker.
- The Worker has no DOM access and receives only host capabilities.
- The public host API must not depend on the UI.

**Edges and seam**

- Touches Worker bootstrap and message protocol only.
- Seam: request/response messages between host and Worker.

**Run**

- `npm run build:web`; run the Worker harness after adding it.

**Unknowns**

- Vite worker URL behavior in production. Stop if development and production resolve differently.

## 3. The workflow

1. Read this brief and restate the bootstrap task in one line.
2. Define typed request, response, error, and cancellation messages.
3. Create the minimal Worker entry and clean-start handshake.
4. Pass manifest and capability data without passing UI objects.
5. Add timeout and termination handling in the host.
6. Run the build and isolation harness, then commit the phase work.

## 4. The test cases

| Case | Input | Expected | Seam |
|---|---|---|---|
| 1 | start one plugin Worker | clean handshake arrives | Worker protocol |
| 2 | malformed request | typed error returns | Worker protocol |
| 3 | cancelled request | Worker terminates | lifecycle host |
| 4 | timeout | Worker terminates and rejects | lifecycle host |
| 5 | UI-free host call | same response as UI path | headless host |
