# Phase 6 task 4 — revocation and pause

## 1. Where this task sits

- **Phase**: Phase 6 Expose, observe, and harden the client APIs; goal: users and operators can stop unsafe integrations.
- **Moves**: R-2 Dynamic Web Worker plugin loading and R-5 Safe contract execution.
- **Starts after**: observability; **waits on**: conformance suite.

## 2. What the developer needs to know

**Read first**

- `RECIPE_SYSTEM_PLAN.md` — plugin revocation, chain pause, and replay protection.
- `src/recipes/client.ts` — plugin lifecycle and unload.
- `src/recipes/policy.ts` — policy gate and execution constraints.

**Settled**

- Revocation is client-side and immediate.
- Pausing a chain blocks new executions, not state reads.
- Uninstall removes package, consent, and execution state.

**Edges and seam**

- Touches revocation, pause, and replay controls.
- Seam: policy decision plus lifecycle control.

**Run**

- `npm run test:recipes`; `npm run build:web`.

**Unknowns**

- Revocation during an in-flight execution. Prefer cancel-and-recover over silent abort.

## 3. The workflow

1. Read this brief and restate the revocation task in one line.
2. Add plugin revocation and uninstall to the public client.
3. Add chain and recipe pause flags to policy configuration.
4. Terminate the plugin Worker and release resources on revoke.
5. Cancel or recover any in-flight execution.
6. Run phase checks and commit the phase work.

## 4. The test cases

| Case | Input | Expected | Seam |
|---|---|---|---|
| 1 | revoke installed plugin | plugin cannot run | revocation |
| 2 | pause a chain | new execution rejected | policy |
| 3 | uninstall plugin | state and consent removed | revocation |
| 4 | revoke during execution | execution cancelled or recovered | lifecycle |
| 5 | replay a revoked plan | typed rejection | replay protection |
