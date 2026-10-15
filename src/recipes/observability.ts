export interface LogEntry {
  correlationId: string;
  event: string;
  pluginId?: string;
  executionId?: string;
  chainId?: number;
  data: Record<string, unknown>;
  at: number;
}

export interface LogStore {
  append(entry: LogEntry): Promise<void>;
  query(correlationId?: string, executionId?: string): Promise<LogEntry[]>;
}

export class MemoryLogStore implements LogStore {
  private readonly entries: LogEntry[] = [];

  async append(entry: LogEntry): Promise<void> {
    this.entries.push({ ...entry });
  }

  async query(correlationId?: string, executionId?: string): Promise<LogEntry[]> {
    return this.entries.filter((entry) => {
      if (correlationId !== undefined && entry.correlationId !== correlationId) return false;
      if (executionId !== undefined && entry.executionId !== executionId) return false;
      return true;
    });
  }
}

const SECRET_KEYS = new Set(["privateKey", "secret", "notes", "seed", "mnemonic", "password", "proof"]);

type RedactedValue = null | boolean | number | string | RedactedValue[] | { [key: string]: RedactedValue };

export function redact(value: unknown): RedactedValue {
  if (value === null || typeof value === "boolean" || typeof value === "number" || typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(redact);
  if (typeof value !== "object") return String(value);
  const out: { [key: string]: RedactedValue } = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    out[key] = SECRET_KEYS.has(key) ? "[redacted]" : redact(item);
  }
  return out;
}

export function logEntry(
  event: string,
  data: Record<string, unknown>,
  extra: { correlationId?: string; pluginId?: string; executionId?: string; chainId?: number; at?: number } = {},
): LogEntry {
  return {
    correlationId: extra.correlationId ?? "unknown",
    event,
    pluginId: extra.pluginId,
    executionId: extra.executionId,
    chainId: extra.chainId,
    data: redact(data) as Record<string, unknown>,
    at: extra.at ?? Date.now(),
  };
}
