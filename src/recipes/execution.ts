import type { RecipePlan } from "./plan.ts";

export type ExecutionStatus =
  | "planned"
  | "source-submitted"
  | "source-confirmed"
  | "bridging"
  | "destination-ready"
  | "destination-submitted"
  | "settled"
  | "recoverable"
  | "cancelled";

export interface RelayTransaction {
  chainId: number;
  to: string;
  data: string;
  value: string;
}

export interface RelaySubmission {
  relayId: string;
  transaction: RelayTransaction;
  idempotencyKey: string;
}

export interface RelayClient {
  submit(request: RelaySubmission): Promise<{ relayId: string; submittedAt: number }>;
  status(relayId: string): Promise<RelayStatus>;
}

export type RelayStatus =
  | { state: "pending" }
  | { state: "confirmed"; confirmedAt: number }
  | { state: "failed"; reason: string };

export interface BridgeIntent {
  bridgeId: string;
  sourceChainId: number;
  destinationChainId: number;
  amount: string;
  recipient: string;
  expiresAt: number;
  payload?: unknown;
}

export type BridgeEvent =
  | { type: "source-confirmed"; bridgeId: string; at: number }
  | { type: "destination-ready"; bridgeId: string; at: number; payload?: unknown }
  | { type: "failed"; bridgeId: string; reason: string }
  | { type: "timeout"; bridgeId: string };

export interface BridgeAdapter {
  begin(execution: RecipeExecution): BridgeIntent;
  observe(execution: RecipeExecution, event: BridgeEvent): RecipeExecution;
}

export interface RecipeExecution {
  id: string;
  idempotencyKey: string;
  plan: RecipePlan;
  status: ExecutionStatus;
  relay?: { id: string; submittedAt?: number; confirmedAt?: number };
  bridge?: BridgeIntent;
  recoveryReason?: string;
  history: string[];
  spentAuthorization?: string;
}

export interface ExecutionStore {
  get(id: string): Promise<RecipeExecution | undefined>;
  getByIdempotencyKey(key: string): Promise<RecipeExecution | undefined>;
  put(execution: RecipeExecution): Promise<void>;
  list(): Promise<RecipeExecution[]>;
}

export class MemoryExecutionStore implements ExecutionStore {
  private readonly byId = new Map<string, RecipeExecution>();

  async get(id: string): Promise<RecipeExecution | undefined> {
    return this.byId.get(id);
  }

  async getByIdempotencyKey(key: string): Promise<RecipeExecution | undefined> {
    return [...this.byId.values()].find((execution) => execution.idempotencyKey === key);
  }

  async put(execution: RecipeExecution): Promise<void> {
    this.byId.set(execution.id, structuredClone(execution));
  }

  async list(): Promise<RecipeExecution[]> {
    return [...this.byId.values()].map((execution) => structuredClone(execution));
  }
}

export function createExecution(input: {
  id: string;
  idempotencyKey: string;
  plan: RecipePlan;
  spentAuthorization?: string;
}): RecipeExecution {
  return {
    id: input.id,
    idempotencyKey: input.idempotencyKey,
    plan: input.plan,
    status: "planned",
    history: ["planned"],
    spentAuthorization: input.spentAuthorization,
  };
}

function transition(execution: RecipeExecution, status: ExecutionStatus, history: string): RecipeExecution {
  return { ...execution, status, history: [...execution.history, history] };
}

export function sourceSubmitted(execution: RecipeExecution, relayId: string, submittedAt: number): RecipeExecution {
  if (execution.status !== "planned") return execution;
  if (execution.relay) throw new Error("Execution already has a Relay submission");
  return transition({ ...execution, relay: { id: relayId, submittedAt } }, "source-submitted", `relay submitted ${relayId}`);
}

export function applyRelayStatus(execution: RecipeExecution, status: RelayStatus): RecipeExecution {
  if (execution.status !== "source-submitted" || !execution.relay) return execution;
  if (status.state === "pending") return execution;
  if (status.state === "failed") return transition({ ...execution, recoveryReason: status.reason }, "recoverable", `relay failed: ${status.reason}`);
  return transition({ ...execution, relay: { ...execution.relay, confirmedAt: status.confirmedAt } }, "source-confirmed", `source confirmed at ${status.confirmedAt}`);
}

export function beginBridge(execution: RecipeExecution, bridge: BridgeIntent): RecipeExecution {
  if (execution.status !== "source-confirmed") throw new Error("Bridge requires a confirmed source execution");
  return transition({ ...execution, bridge }, "bridging", `bridge started ${bridge.bridgeId}`);
}

export function applyBridgeEvent(execution: RecipeExecution, event: BridgeEvent): RecipeExecution {
  if (!execution.bridge || execution.bridge.bridgeId !== event.bridgeId) return execution;
  if (event.type === "failed") return transition({ ...execution, recoveryReason: event.reason }, "recoverable", `bridge failed: ${event.reason}`);
  if (event.type === "timeout") return transition({ ...execution, recoveryReason: "bridge timeout" }, "recoverable", "bridge timeout");
  if (event.type === "source-confirmed") return transition(execution, "bridging", `bridge source confirmed at ${event.at}`);
  if (event.type === "destination-ready") return transition({ ...execution, bridge: { ...execution.bridge, payload: event.payload } }, "destination-ready", `destination ready at ${event.at}`);
  return execution;
}

export function destinationSubmitted(execution: RecipeExecution): RecipeExecution {
  if (execution.status !== "destination-ready") throw new Error("Destination requires a ready bridge execution");
  return transition(execution, "destination-submitted", "destination submitted");
}

export function destinationSettled(execution: RecipeExecution): RecipeExecution {
  if (execution.status !== "destination-submitted") throw new Error("Settlement requires a submitted destination");
  return transition(execution, "settled", "destination settled");
}

export function cancelExecution(execution: RecipeExecution): RecipeExecution {
  if (execution.status === "settled") throw new Error("A settled execution cannot be cancelled");
  return transition(execution, "cancelled", "cancelled");
}
