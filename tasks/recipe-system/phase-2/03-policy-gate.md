# Phase 2 task 3 — contract policy gate

## 1. Where this task sits

- **Phase**: Phase 2 Establish the recipe contract and policy gate; goal: block undeclared effects.
- **Moves**: R-5 Safe contract execution.
- **Starts after**: plan schema and validation; **waits on**: deterministic fixtures.

## 2. What the developer needs to know

**Read first**

- `RECIPE_SYSTEM_PLAN.md` — target, selector, value, approval, and output policy.
- `src/Refuje.sol` — withdrawal and call-blob behavior.
- `src/recipes/types.ts` — existing package boundary.

**Settled**

- Plugin declarations do not bypass host policy.
- Native value and token movement are explicit plan fields.
- Simulation and execution consume one normalized call form.

**Edges and seam**

- Touches policy evaluation and approval normalization.
- Seam: normalized plan to policy decision.

**Run**

- `npm run test:recipes`; `npm run build:web`.

**Unknowns**

- Callback-heavy protocols may need declared risk flags instead of static output inference.

## 3. The workflow

1. Read this brief and restate the policy task in one line.
2. Define target and selector rules with chain-specific configuration.
3. Check native value, token approval, and output bounds.
4. Return explainable policy decisions and rejection reasons.
5. Add malicious target, selector, value, and approval fixtures.
6. Run phase tests and commit the phase work.

## 4. The test cases

| Case | Input | Expected | Seam |
|---|---|---|---|
| 1 | declared target and selector | policy passes | policy gate |
| 2 | undeclared target | policy rejects | policy gate |
| 3 | oversized native value | policy rejects | policy gate |
| 4 | unlimited approval | policy rejects or bounds | approval policy |
| 5 | output below minimum | policy rejects | output policy |
