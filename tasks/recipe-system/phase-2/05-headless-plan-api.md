# Phase 2 task 5 — headless plan API

## 1. Where this task sits

- **Phase**: Phase 2 Establish the recipe contract and policy gate; goal: expose planning without the UI.
- **Moves**: R-1 Recipe contract and validation, R-5 Safe contract execution, and R-7 Headless client APIs and client-owned state.
- **Starts after**: schema, validation, policy, and fixtures; **waits on**: Refuje-native systems.

## 2. What the developer needs to know

**Read first**

- `RECIPE_SYSTEM_PLAN.md` — headless API and policy boundaries.
- `src/recipes/client.ts` — current plugin lifecycle client.
- `src/recipes/types.ts` — current serializable types.

**Settled**

- Planning is separate from signing and Relay submission.
- The UI consumes the same API as other clients.
- Results and errors are serializable.

**Edges and seam**

- Touches the recipe client and plan compiler interface.
- Seam: headless `plan` and `validate` operations.

**Run**

- `npm run test:recipes`; `npm run build:web`.

**Unknowns**

- Plugin activation may be asynchronous. Preserve the existing lifecycle timeout.

## 3. The workflow

1. Read this brief and restate the API task in one line.
2. Add plan and validation operations to the client contract.
3. Route plugin output through normalization and policy checks.
4. Return a serializable plan or structured rejection.
5. Add a UI-free caller fixture.
6. Run phase checks and commit the phase.

## 4. The test cases

| Case | Input | Expected | Seam |
|---|---|---|---|
| 1 | valid recipe input | normalized plan returns | headless API |
| 2 | invalid input | structured rejection returns | headless API |
| 3 | undeclared call | policy rejection returns | headless API |
| 4 | UI-free caller | no DOM access required | headless API |
| 5 | repeated planning | identical serialized result | headless API |
