import { Interface, getAddress, isAddress } from "ethers";
import { normalizePlan, type RecipeApproval, type RecipeAssetFlow, type RecipeCall, type RecipeConstraints, type RecipePlan } from "./plan.ts";

const REFUJE_INTERFACE = new Interface([
  "function widthdrawEth(bytes32 path, bytes targets, bytes[] blobs, bytes proof)",
  "function widthdrawErc20(address token, bytes32 path, bytes targets, bytes[] blobs, bytes proof)",
]);

export interface RefujeWithdrawalInput {
  chainId: number;
  refujeAddress: string;
  path: string;
  targets: string;
  blobs: string[];
  proof: string;
  asset: { kind: "native" } | { kind: "erc20"; token: string };
  flows: RecipeAssetFlow[];
  approvals?: RecipeApproval[];
  constraints?: RecipeConstraints;
  recipeId?: string;
}

export interface RefujeDirectRecipeInput {
  chainId: number;
  recipeId: string;
  calls: RecipeCall[];
  approvals: RecipeApproval[];
  flows: RecipeAssetFlow[];
  constraints?: RecipeConstraints;
  metadata?: Record<string, unknown>;
}

function hex(value: string, field: string): string {
  if (!/^0x(?:[0-9a-f]{2})*$/i.test(value)) throw new Error(`${field} must be even-width hex`);
  return value;
}

function bytes32(value: string, field: string): string {
  const normalized = hex(value, field);
  if (normalized.length !== 66) throw new Error(`${field} must be bytes32`);
  return normalized;
}

function address(value: string, field: string): string {
  if (!isAddress(value)) throw new Error(`${field} must be an address`);
  return getAddress(value);
}

export class RefujeRecipeApi {
  readonly pluginId: string;
  readonly pluginVersion: string;

  constructor(pluginId = "refuje.core", pluginVersion = "1.0.0") {
    this.pluginId = pluginId;
    this.pluginVersion = pluginVersion;
  }

  withdrawal(input: RefujeWithdrawalInput): RecipePlan {
    const refuje = address(input.refujeAddress, "refujeAddress");
    const path = bytes32(input.path, "path");
    const targets = hex(input.targets, "targets");
    const proof = hex(input.proof, "proof");
    const blobs = input.blobs.map((blob, index) => hex(blob, `blobs[${index}]`));
    const token = input.asset.kind === "erc20" ? address(input.asset.token, "asset.token") : undefined;
    const calldata = token
      ? REFUJE_INTERFACE.encodeFunctionData("widthdrawErc20", [token, path, targets, blobs, proof])
      : REFUJE_INTERFACE.encodeFunctionData("widthdrawEth", [path, targets, blobs, proof]);
    return normalizePlan({
      schemaVersion: 1,
      pluginId: this.pluginId,
      pluginVersion: this.pluginVersion,
      recipeId: input.recipeId ?? (token ? "refuje.withdraw.erc20" : "refuje.withdraw.eth"),
      calls: [{ chainId: input.chainId, target: refuje, calldata, value: "0", description: "Refuje withdrawal" }],
      approvals: input.approvals ?? [],
      flows: input.flows,
      constraints: input.constraints ?? {},
      metadata: { system: "refuje", asset: token ? { kind: "erc20", token } : { kind: "native" } },
    }, 0);
  }

  direct(input: RefujeDirectRecipeInput): RecipePlan {
    return normalizePlan({
      schemaVersion: 1,
      pluginId: this.pluginId,
      pluginVersion: this.pluginVersion,
      recipeId: input.recipeId,
      calls: input.calls,
      approvals: input.approvals,
      flows: input.flows,
      constraints: input.constraints ?? {},
      metadata: { system: "refuje", ...input.metadata },
    }, 0);
  }
}
