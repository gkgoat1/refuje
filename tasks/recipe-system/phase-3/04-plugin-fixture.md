# Phase 3 task 4 — Refuje plugin fixture

## 1. Where this task sits

- **Phase**: Phase 3 Ship Refuje-native Cookbook systems; goal: load a Refuje balance plugin through the Worker API.
- **Moves**: R-2 Dynamic Web Worker plugin loading and R-3 Refuje-native key and cross-chain recipes.
- **Starts after**: direct recipe factory; **waits on**: phase integration tests.

## 2. What the developer needs to know

**Read first**

- `src/recipes/types.ts` — plugin activation and runtime contract.
- `web/src/recipeWorker.ts` — dynamic activation path.
- `test/recipes.test.ts` — headless Worker fake pattern.

**Settled**

- Plugin code runs inside its own Worker.
- The host passes capability names, not UI objects.
- Plugin output is normalized and policy checked by the host.

**Edges and seam**

- Touches a test plugin package and the Worker client path.
- Seam: plugin runtime output to Refuje plan.

**Run**

- `npm run test:recipes`; `npm run build:web`.

**Unknowns**

- Browser Worker tests may need a fixture fake while the package remains UI-independent.

## 3. The workflow

1. Read this brief and restate the fixture task in one line.
2. Create a minimal Refuje balance plugin package.
3. Load it through consent and the dynamic module graph.
4. Run a native and ERC-20 plan request.
5. Assert the host receives only serializable output.
6. Run phase checks and commit the phase work.

## 4. The test cases

| Case | Input | Expected | Seam |
|---|---|---|---|
| 1 | native withdrawal input | Refuje plan output | plugin runtime |
| 2 | ERC-20 withdrawal input | Refuje plan output | plugin runtime |
| 3 | capability absent | plugin cannot use it | capability boundary |
| 4 | malformed plan output | host rejects it | plan API |
| 5 | unload then reload | fresh plugin state | Worker lifecycle |
