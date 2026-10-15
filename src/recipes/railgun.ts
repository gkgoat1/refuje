import { normalizePlan, type RecipeApproval, type RecipeAssetFlow, type RecipeCall, type RecipeConstraints, type RecipePlan } from "./plan.ts";

export interface RailgunUtxo {
  noteId: string;
  token: string;
  amount: string;
  chainId: number;
}

export interface RailgunShieldInput {
  chainId: number;
  recipeId?: string;
  token: string;
  amount: string;
  from: string;
  railgunAddress: string;
  utxo: RailgunUtxo;
  calls?: RecipeCall[];
  approvals?: RecipeApproval[];
  constraints?: RecipeConstraints;
}

export interface RailgunUnshieldInput {
  chainId: number;
  recipeId?: string;
  token: string;
  amount: string;
  to: string;
  railgunAddress: string;
  utxo: RailgunUtxo;
  calls?: RecipeCall[];
  approvals?: RecipeApproval[];
  constraints?: RecipeConstraints;
}

export interface RailgunRecipeInput {
  chainId: number;
  recipeId: string;
  unshieldInputs: RailgunUtxo[];
  shieldOutputs: RailgunUtxo[];
  calls: RecipeCall[];
  approvals: RecipeApproval[];
  constraints?: RecipeConstraints;
  fees?: Array<{ amount: string; recipient: string }>;
}

function validateUtxo(utxo: RailgunUtxo, path: string): void {
  if (!utxo.noteId || typeof utxo.noteId !== "string") throw new Error(`${path}.noteId is required`);
  if (!utxo.token || typeof utxo.token !== "string") throw new Error(`${path}.token is required`);
  if (typeof utxo.amount !== "string" || !/^[0-9]+$/.test(utxo.amount)) throw new Error(`${path}.amount must be a decimal integer`);
  if (!Number.isSafeInteger(utxo.chainId) || utxo.chainId <= 0) throw new Error(`${path}.chainId must be positive`);
}

export class RailgunRecipeApi {
  readonly pluginId: string;
  readonly pluginVersion: string;

  constructor(pluginId = "railgun.core", pluginVersion = "1.0.0") {
    this.pluginId = pluginId;
    this.pluginVersion = pluginVersion;
  }

  shield(input: RailgunShieldInput): RecipePlan {
    validateUtxo(input.utxo, "utxo");
    const calls: RecipeCall[] = [
      { chainId: input.chainId, target: input.railgunAddress, calldata: "0xaabbccdd", value: "0", description: "Shield into RAILGUN" },
      ...(input.calls ?? []),
    ];
    const flows: RecipeAssetFlow[] = [
      { direction: "input", asset: { kind: "erc20", chainId: input.chainId, token: input.token }, amount: input.amount, owner: input.from },
      { direction: "output", asset: { kind: "erc20", chainId: input.chainId, token: input.token }, amount: input.amount, owner: input.railgunAddress },
    ];
    return normalizePlan({
      schemaVersion: 1,
      pluginId: this.pluginId,
      pluginVersion: this.pluginVersion,
      recipeId: input.recipeId ?? "railgun.shield",
      calls,
      approvals: input.approvals ?? [],
      flows,
      constraints: input.constraints ?? {},
      metadata: { system: "railgun", utxo: input.utxo, operation: "shield" },
    }, 0);
  }

  unshield(input: RailgunUnshieldInput): RecipePlan {
    validateUtxo(input.utxo, "utxo");
    const calls: RecipeCall[] = [
      { chainId: input.chainId, target: input.railgunAddress, calldata: "0xddccbbaa", value: "0", description: "Unshield from RAILGUN" },
      ...(input.calls ?? []),
    ];
    const flows: RecipeAssetFlow[] = [
      { direction: "input", asset: { kind: "erc20", chainId: input.chainId, token: input.token }, amount: input.amount, owner: input.railgunAddress },
      { direction: "output", asset: { kind: "erc20", chainId: input.chainId, token: input.token }, amount: input.amount, owner: input.to },
    ];
    return normalizePlan({
      schemaVersion: 1,
      pluginId: this.pluginId,
      pluginVersion: this.pluginVersion,
      recipeId: input.recipeId ?? "railgun.unshield",
      calls,
      approvals: input.approvals ?? [],
      flows,
      constraints: input.constraints ?? {},
      metadata: { system: "railgun", utxo: input.utxo, operation: "unshield" },
    }, 0);
  }

  recipe(input: RailgunRecipeInput): RecipePlan {
    for (const [index, utxo] of input.unshieldInputs.entries()) validateUtxo(utxo, `unshieldInputs[${index}]`);
    for (const [index, utxo] of input.shieldOutputs.entries()) validateUtxo(utxo, `shieldOutputs[${index}]`);
    const flows: RecipeAssetFlow[] = [
      ...input.unshieldInputs.map((utxo) => ({ direction: "input" as const, asset: { kind: "erc20" as const, chainId: input.chainId, token: utxo.token }, amount: utxo.amount })),
      ...input.shieldOutputs.map((utxo) => ({ direction: "output" as const, asset: { kind: "erc20" as const, chainId: input.chainId, token: utxo.token }, amount: utxo.amount })),
      ...(input.fees ?? []).map((fee) => ({ direction: "output" as const, asset: { kind: "erc20" as const, chainId: input.chainId, token: input.shieldOutputs[0]?.token ?? "" }, amount: fee.amount, owner: fee.recipient })),
    ];
    return normalizePlan({
      schemaVersion: 1,
      pluginId: this.pluginId,
      pluginVersion: this.pluginVersion,
      recipeId: input.recipeId,
      calls: input.calls,
      approvals: input.approvals,
      flows,
      constraints: input.constraints ?? {},
      metadata: { system: "railgun", unshieldInputs: input.unshieldInputs, shieldOutputs: input.shieldOutputs },
    }, 0);
  }
}
