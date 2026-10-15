#!/usr/bin/env bash
# Regenerates test/mutants/*.patch from the CURRENT src/Refuje.sol.
# Each patch is one hand-picked mutation; run.sh applies them one at a time
# and expects the Forge suite to fail (kill the mutant).
set -euo pipefail
cd "$(dirname "$0")/../.."

mkdir -p test/mutants
rm -f test/mutants/*.patch
ORIG=$(mktemp)

gen() {
  local name="$1" perl_expr="$2"
  cp src/Refuje.sol "$ORIG"
  perl -0pi -e "$perl_expr" src/Refuje.sol
  if cmp -s "$ORIG" src/Refuje.sol; then
    echo "MUTANT $name DID NOT APPLY (pattern not found)" >&2
    exit 1
  fi
  diff -u --label a/src/Refuje.sol --label b/src/Refuje.sol "$ORIG" src/Refuje.sol > "test/mutants/$name.patch" || true
  cp "$ORIG" src/Refuje.sol
  git apply --check "test/mutants/$name.patch" || { echo "MUTANT $name PATCH INVALID" >&2; exit 1; }
  echo "generated $name"
}

# --- fee accounting ---
gen 01-fee-shift-up        's/uint256 fee = k >> 7;/uint256 fee = k >> 6;/'
gen 02-fee-shift-down      's/uint256 fee = k >> 7;/uint256 fee = k >> 8;/'
gen 03-fee-not-subtracted  's/            k -= fee;\n//'
gen 04-fee-charge-skipped  's/            balances\(meta, key, fee, true\);\n//'

# --- nullifier / registration ---
gen 05-nullifier-never-set  's/        nullifiers\[uint248\(nullifier >> 8\)\] \|= 1 << \(nullifier & 255\);\n//'
gen 06-nullifier-check-open 's/nullifiers\[uint248\(nullifier >> 8\)\] & \(1 << \(nullifier & 255\)\) == 0,/nullifiers[uint248(nullifier >> 8)] & (1 << (nullifier & 255)) >= 0,/'
gen 07-registered-check-open 's/pubKeys\[uint248\(nullifier >> 8\)\] & \(1 << \(nullifier & 255\)\) != 0,/pubKeys[uint248(nullifier >> 8)] & (1 << (nullifier & 255)) >= 0,/'

# --- signature / merkle verification ---
gen 08-sig-parity-flip      's/\& 1 ==\n                uint8\(i & 1\);/\& 1 !=\n                uint8(i \& 1);/'
gen 09-merkle-children-swapped 's/abi\.encodePacked\(bytes32\(proof\[\(i \+ 512\) \* 32:\]\), root\)/abi.encodePacked(root, bytes32(proof[(i + 512) * 32:]))/'
gen 10-tree-path-unhashed   's/bytes32 tpath = keccak256\(abi\.encodePacked\(prefix, meta, path\)\);/bytes32 tpath = path;/'

# --- target decoding / flags ---
gen 11-key-scan-absolute-bound 's/j2 < i \+ 63/j2 < 63/'
gen 12-sender-flag-wrong-bit   's/flags & 0x40 != 0/flags \& 0x04 != 0/'
gen 13-approve-flag-wrong-bit  's/payout\(meta, target, k, flags & 0x1\);/payout(meta, target, k, flags \& 0x2);/'

# --- accounting boundaries ---
gen 14-eth-charge-boundary 's/uint256 balance = keyBalances\[uint256\(key\)\];\n            if \(balance < amount\)/uint256 balance = keyBalances[uint256(key)];\n            if (balance <= amount)/'
gen 15-erc-charge-boundary 's/uint256 balance = keyErc20Balances\[address\(token\)\]\[uint256\(key\)\];\n            if \(balance < amount\)/uint256 balance = keyErc20Balances[address(token)][uint256(key)];\n            if (balance <= amount)/'

# --- call blobs ---
gen 16-blob-check-removed 's/keccak256\(blobs\[j\]\) ==\n                            bytes32\(targets\[\(i \+ 32\):\(i \+ 64\)\]\),/true,/'

rm -f "$ORIG"
echo "done: $(ls test/mutants/*.patch | wc -l) mutants"
