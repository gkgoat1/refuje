export const PLAN_SCHEMA_VERSION = 1 as const;

export type RecipeAssetKind = "native" | "erc20";

export interface RecipeAsset {
  kind: RecipeAssetKind;
  token?: string;
  chainId: number;
}

export interface RecipeCall {
  chainId: number;
  target: string;
  calldata: string;
  value: string;
  description?: string;
}

export interface RecipeApproval {
  chainId: number;
  token: string;
  spender: string;
  amount: string;
  resetAfter?: boolean;
}

export interface RecipeAssetFlow {
  direction: "input" | "output";
  asset: RecipeAsset;
  amount: string;
  owner?: string;
  minimum?: string;
}

export interface RecipeConstraints {
  deadline?: number;
  slippageBps?: number;
}

export interface RecipePlan {
  schemaVersion: typeof PLAN_SCHEMA_VERSION;
  pluginId: string;
  pluginVersion: string;
  recipeId: string;
  calls: RecipeCall[];
  approvals: RecipeApproval[];
  flows: RecipeAssetFlow[];
  constraints: RecipeConstraints;
  metadata?: Record<string, unknown>;
}

export interface PlanIssue {
  code: string;
  path: string;
  message: string;
}

export class PlanValidationError extends Error {
  readonly issues: PlanIssue[];

  constructor(issues: PlanIssue[]) {
    super(issues.map((issue) => `${issue.path}: ${issue.message}`).join("; "));
    this.name = "PlanValidationError";
    this.issues = issues;
  }
}

function isAddress(value: unknown): value is string {
  return typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value);
}

function isHex(value: unknown): value is string {
  return typeof value === "string" && /^0x(?:[0-9a-fA-F]{2})*$/.test(value);
}

function decimal(value: unknown): bigint | undefined {
  if (typeof value !== "string" || !/^(0|[1-9][0-9]*)$/.test(value)) return undefined;
  try {
    return BigInt(value);
  } catch {
    return undefined;
  }
}

function issue(issues: PlanIssue[], code: string, path: string, message: string): void {
  issues.push({ code, path, message });
}

export function validatePlan(value: unknown, now = Math.floor(Date.now() / 1000)): PlanIssue[] {
  const issues: PlanIssue[] = [];
  if (!value || typeof value !== "object") return [{ code: "PLAN_OBJECT", path: "plan", message: "plan must be an object" }];
  const plan = value as Partial<RecipePlan>;
  if (plan.schemaVersion !== PLAN_SCHEMA_VERSION) issue(issues, "PLAN_VERSION", "schemaVersion", "unsupported plan schema");
  if (typeof plan.pluginId !== "string" || plan.pluginId.length === 0) issue(issues, "PLUGIN_ID", "pluginId", "pluginId is required");
  if (typeof plan.pluginVersion !== "string" || plan.pluginVersion.length === 0) issue(issues, "PLUGIN_VERSION", "pluginVersion", "pluginVersion is required");
  if (typeof plan.recipeId !== "string" || plan.recipeId.length === 0) issue(issues, "RECIPE_ID", "recipeId", "recipeId is required");
  if (!Array.isArray(plan.calls)) issue(issues, "CALLS", "calls", "calls must be an array");
  if (!Array.isArray(plan.approvals)) issue(issues, "APPROVALS", "approvals", "approvals must be an array");
  if (!Array.isArray(plan.flows)) issue(issues, "FLOWS", "flows", "flows must be an array");

  for (const [index, call] of (plan.calls ?? []).entries()) {
    const path = `calls[${index}]`;
    if (!call || typeof call !== "object") {
      issue(issues, "CALL_OBJECT", path, "call must be an object");
      continue;
    }
    if (!Number.isSafeInteger(call.chainId) || call.chainId <= 0) issue(issues, "CALL_CHAIN", `${path}.chainId`, "chainId must be positive");
    if (!isAddress(call.target)) issue(issues, "CALL_TARGET", `${path}.target`, "target must be an address");
    if (!isHex(call.calldata) || call.calldata.length < 10) issue(issues, "CALL_DATA", `${path}.calldata`, "calldata must include a selector");
    if (isHex(call.calldata) && call.calldata.length % 2 !== 0) issue(issues, "CALL_DATA_WIDTH", `${path}.calldata`, "calldata must have full bytes");
    if (decimal(call.value) === undefined) issue(issues, "CALL_VALUE", `${path}.value`, "value must be a decimal integer");
  }

  for (const [index, approval] of (plan.approvals ?? []).entries()) {
    const path = `approvals[${index}]`;
    if (!approval || typeof approval !== "object") {
      issue(issues, "APPROVAL_OBJECT", path, "approval must be an object");
      continue;
    }
    if (!Number.isSafeInteger(approval.chainId) || approval.chainId <= 0) issue(issues, "APPROVAL_CHAIN", `${path}.chainId`, "chainId must be positive");
    if (!isAddress(approval.token)) issue(issues, "APPROVAL_TOKEN", `${path}.token`, "token must be an address");
    if (!isAddress(approval.spender)) issue(issues, "APPROVAL_SPENDER", `${path}.spender`, "spender must be an address");
    if (decimal(approval.amount) === undefined || decimal(approval.amount) === 0n) issue(issues, "APPROVAL_AMOUNT", `${path}.amount`, "approval amount must be positive");
  }

  for (const [index, flow] of (plan.flows ?? []).entries()) {
    const path = `flows[${index}]`;
    if (!flow || typeof flow !== "object") {
      issue(issues, "FLOW_OBJECT", path, "flow must be an object");
      continue;
    }
    if (flow.direction !== "input" && flow.direction !== "output") issue(issues, "FLOW_DIRECTION", `${path}.direction`, "direction must be input or output");
    if (!flow.asset || typeof flow.asset !== "object") {
      issue(issues, "FLOW_ASSET", `${path}.asset`, "asset is required");
    } else {
      if (flow.asset.kind !== "native" && flow.asset.kind !== "erc20") issue(issues, "FLOW_KIND", `${path}.asset.kind`, "unsupported asset kind");
      if (!Number.isSafeInteger(flow.asset.chainId) || flow.asset.chainId <= 0) issue(issues, "FLOW_CHAIN", `${path}.asset.chainId`, "chainId must be positive");
      if (flow.asset.kind === "erc20" && !isAddress(flow.asset.token)) issue(issues, "FLOW_TOKEN", `${path}.asset.token`, "ERC-20 flow needs a token address");
    }
    if (decimal(flow.amount) === undefined) issue(issues, "FLOW_AMOUNT", `${path}.amount`, "amount must be a decimal integer");
    if (flow.minimum !== undefined && decimal(flow.minimum) === undefined) issue(issues, "FLOW_MINIMUM", `${path}.minimum`, "minimum must be a decimal integer");
  }

  const constraints = plan.constraints;
  if (!constraints || typeof constraints !== "object") issue(issues, "CONSTRAINTS", "constraints", "constraints are required");
  else {
    if (constraints.deadline !== undefined && (!Number.isSafeInteger(constraints.deadline) || constraints.deadline <= now)) issue(issues, "DEADLINE", "constraints.deadline", "deadline must be in the future");
    if (constraints.slippageBps !== undefined && (!Number.isInteger(constraints.slippageBps) || constraints.slippageBps < 0 || constraints.slippageBps > 10_000)) issue(issues, "SLIPPAGE", "constraints.slippageBps", "slippage must be between 0 and 10000 basis points");
  }
  return issues;
}

type Serializable = null | boolean | number | string | Serializable[] | { [key: string]: Serializable };

function stable(value: Serializable): Serializable {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, stable(item)]));
}

export function normalizePlan(value: unknown, now = Math.floor(Date.now() / 1000)): RecipePlan {
  const issues = validatePlan(value, now);
  if (issues.length > 0) throw new PlanValidationError(issues);
  // SAFETY: validatePlan checked the complete RecipePlan shape before normalization.
  return stable(value as Serializable) as unknown as RecipePlan;
}

export function serializePlan(plan: RecipePlan): string {
  return JSON.stringify(normalizePlan(plan, 0));
}
