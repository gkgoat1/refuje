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

## TypeScript client parity

The TypeScript client had three Rust-parity bugs exposed by its mirrored tests:

1. `Contract` and `ContractTransaction` were imported as runtime values, but `ContractTransaction` is type-only in ethers. The imports now use a type import so `src/index.ts` can load.
2. `Privatekey.pubkey()` omitted the per-leaf Keccak hash used by the Rust implementation and the Solidity verifier. It now hashes each derived leaf before building the public key.
3. Bigint target amounts were parsed with an inverted `slice` bound and were emitted at variable width. The parser now reads each byte correctly, and target amounts are zero-padded to the 32-byte Solidity `uint256` representation.

The TypeScript tests cover signature recovery, ABI/Merkle parity, and an end-to-end ETH withdrawal against Anvil.

## Full contract/client feature coverage

The expanded Rust and TypeScript suites cover padded address and key targets, multiple Merkle leaves and nonzero paths, sender restrictions, replay protection, ETH key-to-key transfers, ERC-20 deposits and transfer/approval payouts, call blobs, fee accounting, and underfunded withdrawals. The suites use `MockERC20` and `CallTarget` fixtures for the external-token and callback paths.

The contract had an indexing bug in key-target detection: its padding scan used the absolute bound `j2 < 63`, so every key target after the first target was decoded as an address. The scan now uses the current record's bound (`j2 < i + 63`), allowing multiple key transfers in one withdrawal. The TypeScript client also rejects target keys that are not 32 bytes and paths that cannot be encoded as `bytes32`, preventing malformed target records and transactions.

The test command serializes the Node tests and polls Anvil receipts directly because large proof transactions can be mined before ethers' confirmation waiter observes the receipt:

```sh
cargo test -- --nocapture
npm test
```

Result: **5 Rust tests and 10 TypeScript tests passed, 0 failed**.
