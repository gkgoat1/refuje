import {
  applyBridgeEvent,
  applyRelayStatus,
  beginBridge,
  cancelExecution,
  createExecution,
  destinationSettled,
  destinationSubmitted,
  sourceSubmitted,
  type BridgeAdapter,
  type BridgeEvent,
  type ExecutionStore,
  type RecipeExecution,
  type RelayClient,
} from "./execution.ts";
import type { RecipePlan } from "./plan.ts";

export interface StartExecutionInput {
  id: string;
  idempotencyKey: string;
  plan: RecipePlan;
  spentAuthorization?: string;
}

export class RecipeOrchestrator {
  private readonly store: ExecutionStore;
  private readonly relay: RelayClient;
  private readonly bridge: BridgeAdapter;

  constructor(options: { store: ExecutionStore; relay: RelayClient; bridge: BridgeAdapter }) {
    this.store = options.store;
    this.relay = options.relay;
    this.bridge = options.bridge;
  }

  async start(input: StartExecutionInput): Promise<RecipeExecution> {
    const existing = await this.store.getByIdempotencyKey(input.idempotencyKey);
    if (existing) return existing;
    const execution = createExecution(input);
    await this.store.put(execution);
    return execution;
  }

  async submitSource(executionId: string): Promise<RecipeExecution> {
    const execution = await this.required(executionId);
    if (execution.spentAuthorization) throw new Error(`Authorization is already spent for ${executionId}`);
    const call = execution.plan.calls[0];
    if (!call) throw new Error(`Execution ${executionId} has no source call`);
    const relay = await this.relay.submit({
      relayId: execution.id,
      transaction: { chainId: call.chainId, to: call.target, data: call.calldata, value: call.value },
      idempotencyKey: execution.idempotencyKey,
    });
    const next = sourceSubmitted(execution, relay.relayId, relay.submittedAt);
    await this.store.put(next);
    return next;
  }

  async observeRelay(executionId: string): Promise<RecipeExecution> {
    const execution = await this.required(executionId);
    if (!execution.relay) throw new Error(`Execution ${executionId} has no Relay submission`);
    const status = await this.relay.status(execution.relay.id);
    const next = applyRelayStatus(execution, status);
    await this.store.put(next);
    return next;
  }

  async beginBridge(executionId: string): Promise<RecipeExecution> {
    const execution = await this.required(executionId);
    const next = beginBridge(execution, this.bridge.begin(execution));
    await this.store.put(next);
    return next;
  }

  async observeBridge(executionId: string, event: BridgeEvent): Promise<RecipeExecution> {
    const execution = await this.required(executionId);
    const next = applyBridgeEvent(execution, event);
    await this.store.put(next);
    return next;
  }

  async submitDestination(executionId: string): Promise<RecipeExecution> {
    const execution = await this.required(executionId);
    const next = destinationSubmitted(execution);
    await this.store.put(next);
    return next;
  }

  async settle(executionId: string): Promise<RecipeExecution> {
    const execution = await this.required(executionId);
    const next = destinationSettled(execution);
    await this.store.put(next);
    return next;
  }

  async cancel(executionId: string): Promise<RecipeExecution> {
    const execution = await this.required(executionId);
    const next = cancelExecution(execution);
    await this.store.put(next);
    return next;
  }

  async status(executionId: string): Promise<RecipeExecution> {
    return this.required(executionId);
  }

  private async required(executionId: string): Promise<RecipeExecution> {
    const execution = await this.store.get(executionId);
    if (!execution) throw new Error(`Unknown execution: ${executionId}`);
    return execution;
  }
}
