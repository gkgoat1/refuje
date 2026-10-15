# Phase 6 task 2 — web console adapter

## 1. Where this task sits

- **Phase**: Phase 6 Expose, observe, and harden the client APIs; goal: the UI consumes the headless API.
- **Moves**: R-2 Dynamic Web Worker plugin loading and R-7 Headless client APIs and client-owned state.
- **Starts after**: public headless API; **waits on**: observability.

## 2. What the developer needs to know

**Read first**

- `RECIPE_SYSTEM_PLAN.md` — the web UI is an adapter, not the boundary.
- `web/src/main.ts` — current console structure and forms.
- `web/src/recipeClient.ts` — browser plugin client factory.

**Settled**

- The UI never owns recipe logic.
- Consent prompts come from the headless API callback.
- Plugin identity, dependencies, and capabilities are visible before consent.

**Edges and seam**

- Touches the web console only.
- Seam: UI events to headless client calls.

**Run**

- `npm run build:web`; browser smoke test.

**Unknowns**

- OPFS availability varies by browser. Keep the memory fallback visible.

## 3. The workflow

1. Read this brief and restate the console task in one line.
2. Add a plugin install form using the headless client.
3. Add a consent prompt showing identity, version, dependencies, and capabilities.
4. Add a plan preview with calls, flows, and policy decisions.
5. Add execution status and unload controls.
6. Run the build and browser smoke test, then commit the phase work.

## 4. The test cases

| Case | Input | Expected | Seam |
|---|---|---|---|
| 1 | user selects package | consent prompt appears | UI adapter |
| 2 | user consents | plugin installs and loads | UI adapter |
| 3 | user declines | no plugin installs | UI adapter |
| 4 | plan generated | calls and flows visible | UI adapter |
| 5 | execution tracked | status and recovery visible | UI adapter |
