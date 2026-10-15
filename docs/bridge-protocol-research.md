# Bridge protocol research for the Refuje Relay adapter

**Status**: Complete
**Date**: 2026-10-14
**Decision**: use **Across** as the first bridge adapter behind Relay.

## Constraints the adapter must satisfy

Refuje's model fixes the shape of the integration:

- Refuje keys fund source-side calls; the bridge deposit must be expressible as plain calldata inside a Refuje withdrawal target or call blob.
- The client is a browser / Web Worker environment with no server: status tracking must be plain HTTPS or events.
- Execution state is client-owned: the bridge must expose observable states that map to `source-submitted → bridging → destination-ready → settled`, plus a refund path that maps to `recoverable`.
- The plan requires ERC-20 and native assets, destination call support, and multi-chain coverage.

## Candidate comparison

### Across (recommended)

Intent-based bridge. A user deposits into a SpokePool on the origin chain with destination, token, recipient, and max fee; permissionless relayers front capital on the destination and are reimbursed after optimistic settlement through UMA's oracle. Fills land in about two seconds. [1][2]

- **Assets**: ERC-20 and native ETH; USDC routes settle through CCTP and USDT0 through OFT. [3]
- **Destination calls**: the Swap API supports embedded actions that execute on the destination immediately after the swap. [3]
- **Client-side path**: `/swap/approval` returns executable calldata plus `approvalTxns` when needed; the deposit can also be built directly as a `depositV3` contract call. Status is polled from the deposit status API, which indexes on a 10-second cadence. [3][4]
- **Recovery**: a deposit not filled by its fill deadline is refundable to a refund address — a clean `recoverable` mapping. [3]
- **Security**: optimistic verification with bonds via UMA; OpenZeppelin audits for V2, V3, and the UMA oracle. [5]
- **Chains**: 23+ chains. [3]
- **Caveat**: production API calls require an API key and 2-byte integrator ID; testnet requires neither. Direct contract interaction avoids the API key but loses the aggregated status endpoint. [4]

### Socket

Liquidity aggregator API routing same-chain and cross-chain swaps through one quote-and-execute flow. [6]

- **Client-side path**: quote returns `txData` for the connected wallet; public backend exists for testing but production uses a dedicated backend with an `x-api-key` header. [6]
- **Trade-off**: aggregator convenience, but it introduces a second trust and dependency layer over the underlying bridges, and production access depends on held API credentials. Less aligned with a minimal, directly verifiable adapter.

### LayerZero

Generic messaging with OApp/OFT standards and configurable DVNs. [7]

- **Trade-off**: designed for builders who deploy and configure their own OApp contracts, peers, and DVN sets. Using it as a generic asset bridge would mean shipping and wiring contracts per route — out of scope for a first adapter. V1 is deprecated. [7]

### Wormhole

Guardian-signed VAAs; TokenBridge does lock-and-mint wrapped transfers requiring token attestation on the destination. [8]

- **Trade-off**: the wrapped-token and attestation flow is heavier than a native asset intent, and the guardian set is a 19-of-n multisig trust assumption. Better as a later adapter if wrapped assets are needed.

### Circle CCTP

Permissionless burn-and-mint of native USDC/EURC with a free attestation API and no API key. [9]

- **Trade-off**: single-asset. It is the right second adapter for USDC routes — and Across already settles its USDC routes through CCTP, so the abstractions compose. [3][9]

### Hop

Bonder-based L2 bridge, but V1 incentives are ending ahead of a V2 transition. [10]

- **Trade-off**: protocol mid-migration; not a stable first target.

## Recommendation

Adopt **Across** as the first bridge adapter.

1. The deposit is one plain contract call (`depositV3`), so a Refuje withdrawal can carry it as a call blob without new contract standards.
2. Quote, calldata, approvals, limits, and status are all plain HTTPS, so the Web Worker plugin and headless API can use it without a server.
3. Relayer-fronted fills give near-instant destination delivery, and expiry refunds give a deterministic recovery state.
4. Optimistic settlement with OpenZeppelin-audited contracts is the strongest documented security posture among the fast candidates.

CCTP should be the second adapter for USDC-only routes.

## Adapter interface implications

The existing `BridgeAdapter` (`begin`, `observe`) needs four concrete operations:

- `quote`: input/output token, origin/destination chain, amount, depositor, recipient → executable calldata, approval transactions, fees, limits, fill deadline.
- `submitSource`: the quote's calldata submitted through Relay on the origin chain.
- `observe`: poll the deposit status endpoint by `depositId` + `originChainId`; map `pending → bridging`, `filled(fillTxHash) → destination-ready`, `expired → recoverable (refund)`.
- `recover`: build the refund call for an expired deposit.

Configuration must carry the Across API key, integrator ID, SpokePool addresses per chain, and refund addresses. Testnet operation needs no credentials.

## Sources

1. Across Protocol overview — <https://acrossprotocol.org/>
2. Intent architecture in Across — <https://docs.across.to/guides/concepts/intents-architecture>
3. Across documentation index (chains, Swap API, embedded actions, refunds, tracking) — <https://docs.across.to/llms.txt>
4. Across API keys and integrator ID — <https://docs.across.to/introduction/api-keys>
5. Across and UMA audits — <https://docs.across.to/introduction/audits>
6. Socket API integration guide and v2 schema — <https://docs.socket.tech/llms.txt>, <https://api.socket.tech/v2/swagger/>
7. LayerZero V2 protocol and OApp documentation — <https://docs.layerzero.network/v2/developers/evm/protocol-contracts-overview>, <https://docs.layerzero.network/v2/developers/evm/oapp/overview>
8. Wormhole docs and Token Bridge tutorial — <https://wormhole.com/docs>, <https://wormhole.com/docs/tutorials/messaging/token-bridge/>
9. Circle CCTP API reference — <https://developers.circle.com/api-reference/cctp>
10. Hop V1 sunset notice — <https://x.com/HopProtocol>
