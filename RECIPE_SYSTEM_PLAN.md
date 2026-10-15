# Refuje recipe system

**Status**: Approved decisions, implementation in progress  
**Date**: 2026-10-14  
**Version**: 0.3

## Decision in one screen

Build a versioned Refuje Cookbook with dynamically loaded recipe plugins.

Each plugin gets one fresh dedicated Web Worker.
The host asks the user for consent before loading the plugin and its dependency graph.
Cryptographic plugin verification is not required.

The core API stays headless, so the web UI is only one client.
Proof generation stays client-side.
Relay handles execution submission.
Execution state belongs to the client.

RAILGUN is one supported system, not the Cookbook's foundation.
Its UTXO API stays separate from Refuje's balance API.
Integration covers explicit movement between Refuje keys and shielded funds.

**Review action**: approve this boundary before implementation begins.

## 1. Requirements

- **R-1 Recipe contract and validation** — user request: create a recipe system for contract interactions.
- **R-2 Dynamic Web Worker plugin loading** — user clarification: clean the environment, then dynamically load plugins in Web Workers.
- **R-3 Refuje-native key and cross-chain recipes** — user request: support cross-chain swaps from keys.
- **R-4 RAILGUN system integration** — user clarification: support RAILGUN alongside other Cookbook systems, with key and shielded-fund movement.
- **R-5 Safe contract execution** — required by R-1 Recipe contract and validation.
- **R-6 Versioned, testable plugin integrations** — required by R-2 Dynamic Web Worker plugin loading and the supported systems.
- **R-7 Headless client APIs and client-owned state** — user clarification: support use outside the web UI and keep state with the client.

## 2. The approach, requirement by requirement

### R-1 Recipe contract and validation

- **Approach**: Represent a recipe as versioned metadata, typed inputs, preconditions, and deterministic outputs. Compile it before execution, then validate chains, targets, selectors, amounts, deadlines, and approvals.
- **Touches**: Refuje Cookbook model, compiler, validation policy, token metadata, and existing target/proof builders.
- **Test seam**: recipe compiler boundary with fixed inputs and golden calldata vectors.
- **Acceptance**:
  [ ] one recipe input produces the same normalized plan every time
  [ ] invalid chain, token, amount, slippage, and deadline inputs fail before signing
  [ ] the plan exposes every call, value, approval, and expected output
- **Hard part**: preserving typed intent while supporting protocol-specific calldata and multi-step dependencies.

### R-2 Dynamic Web Worker plugin loading

- **Approach**: Define a plugin API and an install manifest containing identity, version, entry module, dependency graph, requested capabilities, origin, and display text. Ask for user consent, then dynamically load the graph in a fresh dedicated Web Worker.
- **Touches**: Web Worker bootstrap, manifest loader, dependency resolver, consent flow, capability API, lifecycle manager, and cleanup protocol.
- **Test seam**: Worker lifecycle harness with two plugins, stale-state checks, dependency failures, cancellation, and unload.
- **Acceptance**:
  [ ] a fresh Web Worker loads a plugin selected at runtime
  [ ] the user sees the plugin identity, origin, version, dependencies, and capabilities before consent
  [ ] the host loads the declared dependency graph after consent
  [ ] a terminated Worker leaves no plugin state for the next plugin
  [ ] the plugin runs without DOM or Node-only APIs
- **Hard part**: dynamic module graphs must work with browser CORS and CSP rules without sharing globals between plugins.

Plugin code is not cryptographically verified by this system.
Consent is the installation gate.
The UI must make the trust boundary and requested capabilities clear.

### R-3 Refuje-native key and cross-chain recipes

- **Approach**: Treat a Refuje key as a signing and balance identity, not as a wallet account. Refuje-native plugins build key withdrawals, protocol calls, bridge calls, and destination settlement intents as separate stages.
- **Touches**: Refuje signer and proof layer, Cookbook systems, chain registry, bridge adapter, route planner, Relay client, and client-owned execution state.
- **Test seam**: deterministic plan compilation plus mocked Relay and bridge state; use fork tests for selected protocols later.
- **Acceptance**:
  [ ] a key reference or supplied proof can fund a typed source-chain call bundle
  [ ] every call binds to an expected chain and Refuje instance
  [ ] slippage, recipient, expiry, and minimum-output constraints survive compilation
  [ ] retries cannot replay a spent Refuje authorization
  [ ] a destination failure becomes recoverable client state
  [ ] a RAILGUN recipe is not required for a Refuje-native recipe
- **Hard part**: cross-chain execution is asynchronous and non-atomic, so the client must retain recovery state.

### R-4 RAILGUN system integration

- **Approach**: Keep a dedicated RailgunRecipeApi for UTXO inputs, outputs, shielding, unshielding, and proving. Add an integration adapter for explicit key-to-shielded and shielded-to-key transfers. Port selected Cookbook recipes directly to Refuje's balance API instead of forcing every recipe through RAILGUN.
- **Touches**: RefujeRecipeApi, RailgunRecipeApi, asset-transfer adapter, client-side proving, shield and unshield flows, and Relay submission.
- **Test seam**: separate balance and UTXO fixtures, then integration fixtures for key-to-shield and shield-to-key movement.
- **Acceptance**:
  [ ] Refuje recipes compile against balances without importing the RAILGUN API
  [ ] RAILGUN recipes compile against UTXOs without pretending they are balances
  [ ] a selected RAILGUN recipe can run through its own API
  [ ] selected RAILGUN recipes have direct Refuje ports where that is useful
  [ ] key-to-shielded and shielded-to-key flows preserve assets, fees, and destinations
  [ ] the integration boundary records both systems' identifiers and states
- **Hard part**: UTXO ownership, proving state, and balance accounting cannot share one hidden model.

RAILGUN support is an optional Cookbook system plugin.
The Refuje Cookbook can support other systems without depending on RAILGUN.

### R-5 Safe contract execution

- **Approach**: Make every external call pass through a policy gate. Plugins declare targets, selectors, value bounds, token movement, and risk flags; the client checks them against chain configuration and user intent.
- **Touches**: policy engine, call normalizer, simulation service, address registry, approval planner, and execution log.
- **Test seam**: policy gate with malicious target, selector, value, approval, chain, and deadline fixtures.
- **Acceptance**:
  [ ] undeclared targets and selectors cannot execute
  [ ] token approvals are bounded and consumed or reset by policy
  [ ] native value and token output limits are checked before signing
  [ ] simulations and final calldata share one normalized call representation
  [ ] every execution records plugin version, chain, targets, and policy result
- **Hard part**: arbitrary protocol calls can hide token movement behind callbacks and delegated execution.

### R-6 Versioned, testable plugin integrations

- **Approach**: Version the recipe schema, plugin API, dependency graph, chain registry, and protocol metadata independently. Publish conformance fixtures for every system plugin.
- **Touches**: schema versioning, plugin packaging, dependency metadata, fixture catalog, compatibility checks, and release process.
- **Test seam**: plugin conformance suite plus replayable plan and execution fixtures.
- **Acceptance**:
  [ ] incompatible plans fail clearly before partial execution
  [ ] each plugin has fixtures for success, rejection, unload, and retry
  [ ] protocol addresses and selectors are chain-versioned and auditable
  [ ] dependency changes produce a new plugin version or consent prompt
- **Hard part**: protocol upgrades can change calldata, addresses, or runtime requirements without changing the user-facing action.

### R-7 Headless client APIs and client-owned state

- **Approach**: Expose plugin installation, loading, planning, simulation, execution, and status as framework-neutral client APIs. Keep execution state serializable and stored by the caller, while the web UI consumes the same APIs.
- **Touches**: public client API, Worker bridge, state serializer, Relay client, storage adapter, and UI adapter.
- **Test seam**: headless API tests that run without a DOM, followed by one web-console integration.
- **Acceptance**:
  [ ] a caller can install and run a plugin without rendering the web UI
  [ ] a caller can persist, restore, cancel, and retry an execution
  [ ] the UI does not own recipe or execution logic
  [ ] no server-side database is required for the first release
  [ ] Relay status can be reconciled from client-owned state
- **Hard part**: browser lifecycle loss must not make a cross-chain execution unrecoverable.

## 3. Vocabulary and boundaries

- **Recipe**: a versioned user intention with typed inputs and protocol steps.
- **Plugin**: a dynamically loaded module that implements one recipe family inside its own Web Worker.
- **Manifest**: install metadata for plugin identity, entry module, dependencies, capabilities, and consent text.
- **Dependency graph**: the ESM modules loaded by one plugin instance.
- **RefujeRecipeApi**: the balance-based API for Refuje keys and Refuje-native systems.
- **RailgunRecipeApi**: the UTXO-based API for shielded RAILGUN funds.
- **Plan**: normalized calls, transfers, approvals, outputs, and execution constraints.
- **Key**: a Refuje signing and balance identity. It is not a raw private key.
- **Proof**: serialized authorization or proving material supplied by the client-side signer or prover.
- **Relay**: the selected execution submission service or client.
- **Execution**: simulation, signing, Relay submission, confirmation, and recovery.
- **Web Worker**: one fresh dedicated plugin host created for one plugin instance.
- **Integration adapter**: an explicit boundary between two accounting systems.

The Worker receives only capabilities passed through the host API.
A signer or prover owns private key material, notes, and zero-knowledge secrets on the client.

The host asks for consent before each new plugin installation or plugin version.
A plugin may load a declared dependency graph after consent.
No cryptographic code verification is required.

Each plugin instance gets its own fresh Worker.
Unloading or replacing a plugin terminates its Worker, drops message ports, clears references, and releases module URLs.
The next plugin starts in a new environment.

The Web UI is an adapter over the headless APIs.
It is not the execution boundary.

## 4. Phases

### Phase 1 — Prove consented dynamic Web Worker loading

**Covers**: R-2 Dynamic Web Worker plugin loading, R-6 Versioned, testable plugin integrations, and R-7 Headless client APIs and client-owned state.

**Goal**: a caller consents to a plugin, loads its dependency graph in a fresh Web Worker, uses its headless API, and unloads it cleanly.

**Tasks**

- Define the plugin Manifest, consent record, capability request, and dependency graph
- Build a minimal Web Worker bootstrap with one Worker per plugin instance
- Load a multi-module plugin graph only after user consent
- Expose install, load, run, unload, and status operations without DOM dependencies
- Terminate the Worker and release resources when the plugin is unloaded or replaced
- Test plugin A followed by plugin B for state and message isolation

**Proof**: the lifecycle test loads two plugins in sequence, uses their headless APIs, and shows no state crossing the Worker boundary.

**Not here**: cryptographic plugin verification, production proving, bridge execution, or RAILGUN-specific behavior.

### Phase 2 — Establish the recipe contract and policy gate

**Covers**: R-1 Recipe contract and validation, R-5 Safe contract execution, and R-6 Versioned, testable plugin integrations.

**Goal**: a recipe becomes a deterministic, reviewable plan that cannot contain undeclared contract effects.

**Tasks**

- Define the versioned recipe, plugin API, plan, and execution-result schemas
- Implement typed input validation for chains, tokens, amounts, recipients, deadlines, and slippage
- Normalize calls, approvals, native value, expected outputs, and policy metadata
- Add target and selector policies with chain-specific address configuration
- Add deterministic fixtures for valid plans and policy rejections

**Proof**: golden plan tests produce stable calldata and malicious-plan tests fail before signing.

**Not here**: bridge routing, RAILGUN proving, and UI-specific behavior.

### Phase 3 — Ship Refuje-native Cookbook systems

**Covers**: R-1 Recipe contract and validation, R-3 Refuje-native key and cross-chain recipes, R-5 Safe contract execution, and R-7 Headless client APIs and client-owned state.

**Goal**: a Refuje key can run a balance-based recipe without depending on the web UI or RAILGUN.

**Tasks**

- Add chain and Refuje-instance configuration to RefujeRecipeApi
- Connect the existing signer and proof builders to the plan compiler
- Compile withdrawals, fees, target records, call blobs, approvals, and proof inputs
- Port one useful external Cookbook recipe directly to Refuje balances
- Simulate the source call and return a user-reviewable transaction envelope

**Proof**: a local Anvil flow executes a signed key withdrawal and a direct Refuje recipe while conserving assets and blocking replay.

**Not here**: a production bridge, destination confirmation, and shielded funds.

### Phase 4 — Add Relay-backed cross-chain orchestration

**Covers**: R-3 Refuje-native key and cross-chain recipes, R-5 Safe contract execution, and R-7 Headless client APIs and client-owned state.

**Goal**: a key-based swap has visible source, Relay, destination, and recovery states owned by the client.

**Tasks**

- Define bridge adapter inputs, outputs, status events, and idempotency keys
- Route source and destination submissions through Relay
- Add chain, token, amount, expiry, and minimum-output constraints
- Serialize source submission, Relay observation, destination submission, and settlement state
- Add timeout, replacement, recovery, and browser-restart handling
- Test duplicate delivery, reordering, partial completion, and destination rejection

**Proof**: a mocked two-chain run reaches success, retry, and recovery states without double-spending a key.

**Not here**: choosing a bridge protocol or promising atomic cross-chain settlement.

### Phase 5 — Add RAILGUN as a separate Cookbook system

**Covers**: R-4 RAILGUN system integration, R-5 Safe contract execution, R-6 Versioned, testable plugin integrations, and R-7 Headless client APIs and client-owned state.

**Goal**: RAILGUN recipes use their UTXO API, while explicit key and shielded-fund transfers cross a documented integration boundary.

**Tasks**

- Define RailgunRecipeApi inputs, outputs, shield operations, unshield operations, and proof handoff
- Add a RAILGUN system plugin without importing it into RefujeRecipeApi
- Port selected Cookbook recipes directly to RefujeRecipeApi where balance execution is appropriate
- Add key-to-shielded and shielded-to-key transfer recipes
- Keep proving client-side and route final submission through Relay
- Test UTXO accounting, balance accounting, fees, destinations, and failure recovery separately

**Proof**: separate fixtures prove each accounting model, and integration fixtures prove only the declared transfers between them.

**Not here**: treating UTXOs as balances, storing private notes in the Worker, or making RAILGUN a core dependency.

### Phase 6 — Expose, observe, and harden the client APIs

**Covers**: R-1 Recipe contract and validation, R-2 Dynamic Web Worker plugin loading, R-3 Refuje-native key and cross-chain recipes, R-4 RAILGUN system integration, R-5 Safe contract execution, R-6 Versioned, testable plugin integrations, and R-7 Headless client APIs and client-owned state.

**Goal**: callers can install, review, execute, unload, and recover recipes without depending on one UI.

**Tasks**

- Add headless discovery, consent, planning, simulation, execution, unload, and status APIs
- Show plugin identity, dependency graph, capabilities, asset flows, limits, and policy decisions in the web console
- Add structured client logs, correlation IDs, metrics, and redacted failure details
- Add user uninstall, plugin pause, chain pause, rate limits, and replay protection
- Run fuzz, mutation, fork, Worker-isolation, and conformance tests across supported systems

**Proof**: a headless caller and the web UI complete the same recipe, while a user can revoke a plugin and recover a pending execution.

**Not here**: unattended custody, server-owned execution state, mandatory code verification, or unrestricted protocol discovery.

## 5. Resolved decisions

1. **Worker lifecycle**: create one fresh dedicated Web Worker per plugin instance.
2. **Plugin trust**: require explicit user consent for installation; do not require cryptographic verification.
3. **Plugin format**: load a dynamic ESM dependency graph.
4. **Plugin source**: accept local uploads and store installed packages in OPFS.
5. **Consent lifetime**: support persistent consent and temporary installation without saved state.
6. **Proof boundary**: keep signing and proving client-side.
7. **Execution authority**: use Relay for submission and status interaction.
8. **Cookbook scope**: port all Cookbook recipes directly to Refuje where possible; keep RAILGUN as one supported system and support key/shielded-fund movement.
9. **Accounting APIs**: keep RefujeRecipeApi and RailgunRecipeApi separate, with explicit integration adapters.
10. **Persistence**: keep recipe and execution state client-owned with localStorage and OPFS.
11. **UI boundary**: expose pluggable headless APIs that the web UI consumes but does not own.

## 6. Remaining decisions

1. Which bridge protocol should be the first adapter behind Relay?
2. Which OPFS package layout should the first release standardize?
3. Which Relay environments should the first integration support?

## 7. External references

- RAILGUN Cookbook overview: <https://docs.railgun.org/developer-guide/cookbook/cookbook-overview>
- RAILGUN recipe guide: <https://docs.railgun.org/developer-guide/cookbook/write>
- Cookbook package: <https://www.npmjs.com/package/@railgun-community/cookbook>
- Cookbook source: <https://github.com/Railgun-Community/cookbook>

The Cookbook documentation describes Steps, Recipes, Combo Meals, unshield inputs, re-shield outputs, and clean-slate approvals.
The implementation must confirm the package API and Web Worker compatibility before Phase 5 closes.

## Changelog

- **2026-10-14** — Created the initial review plan for Worker plugins, Refuje key recipes, cross-chain execution, and RAILGUN Cookbook integration.
- **2026-10-14** — Revised the plan for dynamic plugins in clean Web Workers.
- **2026-10-14** — Resolved the scope: consented installation, separate balance and UTXO APIs, client-side proving, Relay submission, and client-owned state.
- **2026-10-14** — Resolved local upload and OPFS storage, temporary or persistent consent, all Cookbook recipe ports, and the three headless client storage APIs.
