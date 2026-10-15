# Phase 3 task 2 — Refuje withdrawal compiler

## 1. Where this task sits

- **Phase**: Phase 3 Ship Refuje-native Cookbook systems; goal: compile a constrained key withdrawal.
- **Moves**: R-3 Refuje-native key and cross-chain recipes and R-5 Safe contract execution.
- **Starts after**: RefujeRecipeApi; **waits on**: direct recipe ports.

## 2. What the developer needs to know

**Read first**

- `src/Refuje.sol` — misspelled `widthdraw` methods are the deployed ABI.
- `src/index.ts` — target and proof byte conventions.
- `src/recipes/policy.ts` — policy consumes normalized call data.

**Settled**

- The compiler does not sign or submit.
- ETH and ERC-20 calls remain explicit variants.
- Proof material is supplied by the client-side signer.

**Edges and seam**

- Touches withdrawal calldata compilation only.
- Seam: withdrawal input to exact ABI call.

**Run**

- `npm run test:recipes`; existing TypeScript tests; `npm run build:web`.

**Unknowns**

- Blob encoding must match the existing clients. Pin literal vectors before abstraction.

## 3. The workflow

1. Read this brief and restate the compiler task in one line.
2. Define native and ERC-20 withdrawal inputs.
3. Encode the exact Refuje entry-point calldata.
4. Attach flows, approvals, constraints, and metadata.
5. Compare output against known client vectors.
6. Run phase checks and commit the phase work.

## 4. The test cases

| Case | Input | Expected | Seam |
|---|---|---|---|
| 1 | ETH proof input | `widthdrawEth` call | compiler |
| 2 | ERC-20 proof input | `widthdrawErc20` call | compiler |
| 3 | malformed proof | rejection before encoding | compiler |
| 4 | target flow metadata | exact output flow | compiler |
| 5 | same input twice | identical calldata | compiler |
