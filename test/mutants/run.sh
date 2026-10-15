#!/usr/bin/env bash
# Mutation campaign: applies each test/mutants/*.patch to src/Refuje.sol and
# runs the Forge suite. A mutant is KILLED when the suite fails and SURVIVES
# when it passes — survivors are suite blind spots.
#
#   test/mutants/run.sh           full suite per mutant (slow, thorough)
#   test/mutants/run.sh --fast    unit+fuzz+symbolic-as-fuzz only (skips the
#                                 invariant campaign; some accounting mutants
#                                 are only caught by the invariants)
#
# Regenerate patches after editing src/Refuje.sol with test/mutants/generate.sh.
set -u
cd "$(dirname "$0")/../.."

MATCH=()
if [ "${1:-}" = "--fast" ]; then
  MATCH=(--match-contract "RefujeTest|RefujeSignerTest|RefujeSymbolicTest")
fi

shopt -s nullglob
mutants=(test/mutants/*.patch)
if [ ${#mutants[@]} -eq 0 ]; then
  echo "no mutants found; run test/mutants/generate.sh first" >&2
  exit 1
fi

applied=""
cleanup() {
  if [ -n "$applied" ]; then git apply -R "$applied" 2>/dev/null; fi
}
trap cleanup EXIT

killed=0
survivors=()
for m in "${mutants[@]}"; do
  name=$(basename "$m" .patch)
  if ! git apply --check "$m" 2>/dev/null; then
    echo "SKIP     $name (patch does not apply; regenerate with generate.sh)"
    survivors+=("$name (inapplicable)")
    continue
  fi
  git apply "$m"
  applied="$m"
  if forge test --quiet ${MATCH[@]+"${MATCH[@]}"} > /tmp/refuje-mutant.log 2>&1; then
    echo "SURVIVED $name"
    survivors+=("$name")
  else
    echo "KILLED   $name"
    killed=$((killed + 1))
  fi
  git apply -R "$m"
  applied=""
done

echo
echo "mutation score: $killed/${#mutants[@]} killed"
if [ ${#survivors[@]} -gt 0 ]; then
  printf 'survivor: %s\n' "${survivors[@]}"
  exit 1
fi
