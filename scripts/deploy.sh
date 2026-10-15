#!/usr/bin/env bash
# Deploy Refuje and verify the exact via-IR/optimizer configuration used by
# foundry.toml. Required: RPC_URL and PRIVATE_KEY. For Etherscan-style
# verification also set ETHERSCAN_API_KEY. Set SKIP_VERIFY=1 for local Anvil.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

: "${RPC_URL:?Set RPC_URL (or put it in .env).}"
: "${PRIVATE_KEY:?Set PRIVATE_KEY (or put it in .env).}"

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required to read Foundry's broadcast artifact." >&2
  exit 1
fi

RPC_CHAIN_ID="$(cast chain-id --rpc-url "$RPC_URL")"
VERIFY_CHAIN="${CHAIN:-$RPC_CHAIN_ID}"
BROADCAST="broadcast/Deploy.s.sol/${RPC_CHAIN_ID}/run-latest.json"

printf 'Deploying Refuje to chain %s…\n' "$RPC_CHAIN_ID"
forge script script/Deploy.s.sol:DeployScript \
  --rpc-url "$RPC_URL" \
  --private-key "$PRIVATE_KEY" \
  --broadcast \
  --slow

if [[ ! -f "$BROADCAST" ]]; then
  echo "Expected broadcast artifact was not created: $BROADCAST" >&2
  exit 1
fi

ADDRESS="$(jq -r '[.transactions[] | select(.transactionType == "CREATE" and .contractName == "Refuje")] | .[-1].contractAddress // empty' "$BROADCAST")"
CREATE_TX="$(jq -r '[.transactions[] | select(.transactionType == "CREATE" and .contractName == "Refuje")] | .[-1].hash // empty' "$BROADCAST")"

if [[ -z "$ADDRESS" || "$ADDRESS" == "null" ]]; then
  echo "Could not find the Refuje CREATE transaction in $BROADCAST." >&2
  exit 1
fi
printf 'Refuje deployed at %s\n' "$ADDRESS"
printf 'Creation transaction: %s\n' "$CREATE_TX"

if [[ "${SKIP_VERIFY:-0}" == "1" ]]; then
  echo "Skipping verification (SKIP_VERIFY=1)."
  exit 0
fi

VERIFIER="${VERIFIER:-etherscan}"
if [[ "$VERIFIER" == "etherscan" && -z "${ETHERSCAN_API_KEY:-}" ]]; then
  echo "ETHERSCAN_API_KEY is required for Etherscan verification; use SKIP_VERIFY=1 only for local deployments." >&2
  exit 1
fi

VERIFY_ARGS=(
  "$ADDRESS"
  "src/Refuje.sol:Refuje"
  --rpc-url "$RPC_URL"
  --chain "$VERIFY_CHAIN"
  --verifier "$VERIFIER"
  --watch
  --profile default
  --via-ir
  --num-of-optimizations 1000000
)
if [[ -n "$CREATE_TX" ]]; then
  VERIFY_ARGS+=(--creation-transaction-hash "$CREATE_TX")
fi
if [[ "$VERIFIER" == "etherscan" ]]; then
  VERIFY_ARGS+=(--etherscan-api-key "$ETHERSCAN_API_KEY")
elif [[ -n "${VERIFIER_API_KEY:-}" ]]; then
  VERIFY_ARGS+=(--verifier-api-key "$VERIFIER_API_KEY")
fi
if [[ -n "${VERIFIER_URL:-}" ]]; then
  VERIFY_ARGS+=(--verifier-url "$VERIFIER_URL")
fi

printf 'Verifying %s with %s…\n' "$ADDRESS" "$VERIFIER"
forge verify-contract "${VERIFY_ARGS[@]}"
printf 'Verified %s\n' "$ADDRESS"
