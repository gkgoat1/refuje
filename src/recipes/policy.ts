import type { RecipePlan } from "./plan.ts";

export interface CallPolicy {
  selectors?: string[];
  maxValue?: string;
}

export interface ChainPolicy {
  chainId: number;
  targets: Record<string, CallPolicy>;
  maxApproval?: string;
}

export interface PolicyConfig {
  chains: ChainPolicy[];
}

export interface PolicyIssue {
  code: string;
  path: string;
  message: string;
}

export interface PolicyResult {
  allowed: boolean;
  issues: PolicyIssue[];
}

export class PolicyViolationError extends Error {
  readonly result: PolicyResult;

  constructor(result: PolicyResult) {
    super(result.issues.map((issue) => `${issue.path}: ${issue.message}`).join("; "));
    this.name = "PolicyViolationError";
    this.result = result;
  }
}

function address(value: string): string {
  return value.toLowerCase();
}

function amount(value: string): bigint {
  return BigInt(value);
}

function policyIssue(issues: PolicyIssue[], code: string, path: string, message: string): void {
  issues.push({ code, path, message });
}

export function evaluatePolicy(plan: RecipePlan, config: PolicyConfig): PolicyResult {
  const issues: PolicyIssue[] = [];
  for (const [index, call] of plan.calls.entries()) {
    const chain = config.chains.find((item) => item.chainId === call.chainId);
    if (!chain) {
      policyIssue(issues, "CHAIN_NOT_ALLOWED", `calls[${index}].chainId`, `chain ${call.chainId} is not allowed`);
      continue;
    }
    const target = chain.targets[address(call.target)];
    if (!target) {
      policyIssue(issues, "TARGET_NOT_ALLOWED", `calls[${index}].target`, `target ${call.target} is not allowed`);
      continue;
    }
    const selector = call.calldata.slice(0, 10).toLowerCase();
    if (target.selectors && !target.selectors.map((item) => item.toLowerCase()).includes(selector)) {
      policyIssue(issues, "SELECTOR_NOT_ALLOWED", `calls[${index}].calldata`, `selector ${selector} is not allowed`);
    }
    if (target.maxValue !== undefined && amount(call.value) > amount(target.maxValue)) {
      policyIssue(issues, "VALUE_LIMIT", `calls[${index}].value`, "native value exceeds policy limit");
    }
  }

  for (const [index, approval] of plan.approvals.entries()) {
    const chain = config.chains.find((item) => item.chainId === approval.chainId);
    if (!chain) {
      policyIssue(issues, "APPROVAL_CHAIN_NOT_ALLOWED", `approvals[${index}].chainId`, `chain ${approval.chainId} is not allowed`);
      continue;
    }
    if (chain.maxApproval !== undefined && amount(approval.amount) > amount(chain.maxApproval)) {
      policyIssue(issues, "APPROVAL_LIMIT", `approvals[${index}].amount`, "approval exceeds policy limit");
    }
  }

  for (const [index, flow] of plan.flows.entries()) {
    if (flow.minimum !== undefined && amount(flow.minimum) > amount(flow.amount)) {
      policyIssue(issues, "OUTPUT_MINIMUM", `flows[${index}].minimum`, "minimum exceeds planned amount");
    }
  }
  return { allowed: issues.length === 0, issues };
}
