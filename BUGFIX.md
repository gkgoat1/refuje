# Withdrawal proof and accounting bug

The ETH withdrawal failed even though the Rust client and Solidity contract appeared to use the same inputs. The underlying issue was a set of mismatches between the client-side proof construction and the contract's verification/accounting paths.

## Root causes and fixes

1. **ABI preimages did not match Solidity.** Solidity's `abi.encode(a, b, c)` encodes a parameter sequence. Alloy's tuple `.abi_encode()` encodes the tuple as a single value, so hashes for the signed targets and payment path differed. The Rust code now uses `.abi_encode_params()` for these Solidity-compatible preimages, including call blobs.
2. **The Merkle proof used the wrong path.** The tree is indexed by `keccak256(abi.encode(prefix, meta, path))`, while the withdrawal call still sends the original `path`. Rust now retains both values and uses the hashed `tree_path` for insertion and proof generation. Solidity also had the Merkle fold's children reversed for set path bits; a set bit means the current node is the right child, so the sibling must be hashed first.
3. **A sufficient balance could panic.** `require(balance >= amount, NeedBalance(amount - balance))` evaluates the custom-error argument even when the condition is true. When `balance` exceeded `amount`, `amount - balance` underflowed before `require` could return. ETH and ERC-20 accounting now check insufficiency in an `if` and construct `NeedBalance` only on that branch.
4. **The payout fee was subtracted twice.** The target amount is the requested recipient payout; the fee is charged and paid separately. Subtracting the fee from the target amount again reduced the recipient's payout unnecessarily. That second subtraction was removed.

The tests now check Solidity-compatible ABI preimages, reconstruct the Merkle root from a generated proof, and exercise an end-to-end ETH withdrawal with an exact recipient-balance assertion.

## Verification

The tests use a local Anvil node at `localhost:8545`; no forked chain state is needed. `anvil.sh` now starts that local node with auto-impersonation instead of depending on the remote fork endpoint.

With Anvil running (`sh ./anvil.sh` in a separate terminal), the following passed:

```sh
sh ./build.sh
cargo test -- --nocapture
```

Result: **3 passed, 0 failed**.
