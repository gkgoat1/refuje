# Phase 5 task 5 — RAILGUN integration proof

## 1. Where this task sits

- **Phase**: Phase 5 Add RAILGUN as a separate Cookbook system; goal: prove both accounting models and the transfer boundary.
- **Moves**: R-4 RAILGUN system integration, R-5 Safe contract execution, and R-6 Versioned, testable plugin integrations.
- **Starts after**: RAILGUN plugin; **waits on**: Phase 6 exposure and hardening.

## 2. What the developer needs to know

**Read first**

- `RECIPE_SYSTEM_PLAN.md` — Phase 5 proof requirements.
- `src/recipes/railgun.ts` — final UTXO API seam.
- `test/recipes.test.ts` — headless test conventions.

**Settled**

- UTXO and balance accounting are tested separately.
- Integration fixtures only cross at the declared boundary.
- RAILGUN is not a core dependency of Refuje recipes.

**Edges and seam**

- Touches RAILGUN and integration fixtures only.
- Seam: separate accounting tests plus integration fixtures.

**Run**

- `npm run test:recipes`; `npm run test:forge`; `npm run build:web`.

**Unknowns**

- RAILGUN proving fixtures may need official package types. Wrap them in the adapter.

## 3. The workflow

1. Read this brief and restate the proof task in one line.
2. Add Refuje balance accounting fixtures.
3. Add RAILGUN UTXO accounting fixtures.
4. Add key-to-shielded and shielded-to-key fixtures.
5. Assert fees, destinations, and failure recovery on each.
6. Run phase checks and commit the phase.

## 4. The test cases

| Case | Input | Expected | Seam |
|---|---|---|---|
| 1 | balance-only fixture | Refuje plan only | accounting |
| 2 | UTXO-only fixture | RAILGUN plan only | accounting |
| 3 | key to shielded | both systems recorded | integration |
| 4 | shielded to key | both systems recorded | integration |
| 5 | Forge contract suite | existing behavior green | integration |
