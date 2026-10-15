import type { RelayClient, RelayStatus, RelaySubmission } from "./execution.ts";

export class MockRelayClient implements RelayClient {
  private readonly submissions = new Map<string, { relayId: string; submittedAt: number }>();
  private readonly statuses = new Map<string, RelayStatus>();
  private readonly now: () => number;

  constructor(now: () => number = Date.now) {
    this.now = now;
  }

  async submit(request: RelaySubmission): Promise<{ relayId: string; submittedAt: number }> {
    const existing = this.submissions.get(request.idempotencyKey);
    if (existing) return existing;
    const relayId = `relay-${this.submissions.size + 1}`;
    const result = { relayId, submittedAt: this.now() };
    this.submissions.set(request.idempotencyKey, result);
    this.statuses.set(relayId, { state: "pending" });
    return result;
  }

  async status(relayId: string): Promise<RelayStatus> {
    return this.statuses.get(relayId) ?? { state: "failed", reason: "unknown relay transaction" };
  }

  setStatus(relayId: string, status: RelayStatus): void {
    this.statuses.set(relayId, status);
  }
}
