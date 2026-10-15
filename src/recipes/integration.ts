import { normalizePlan, type RecipeCall, type RecipeAssetFlow, type RecipePlan } from "./plan.ts";
import type { RefujeWithdrawalInput } from "./refuje.ts";
import type { RailgunShieldInput, RailgunUnshieldInput } from "./railgun.ts";

export interface KeyToShieldedInput {
  refuje: RefujeWithdrawalInput;
  railgun: RailgunShieldInput;
  integrationId: string;
}

export interface ShieldedToKeyInput {
  railgun: RailgunUnshieldInput;
  refuje: RefujeWithdrawalInput;
  integrationId: string;
}

export class RefujeRailgunIntegration {
  keyToShielded(input: KeyToShieldedInput): RecipePlan {
    const calls: RecipeCall[] = [
      { chainId: input.refuje.chainId, target: input.refuje.refujeAddress, calldata: "0x11223344", value: "0", description: "Refuje key withdrawal" },
      { chainId: input.railgun.chainId, target: input.railgun.railgunAddress, calldata: "0xaabbccdd", value: "0", description: "RAILGUN shield" },
    ];
    const flows: RecipeAssetFlow[] = [
      ...input.refuje.flows,
      { direction: "output", asset: { kind: "erc20", chainId: input.railgun.chainId, token: input.railgun.token }, amount: input.railgun.amount, owner: input.railgun.railgunAddress },
    ];
    return normalizePlan({
      schemaVersion: 1,
      pluginId: "refuje.railgun.integration",
      pluginVersion: "1.0.0",
      recipeId: `key-to-shielded.${input.integrationId}`,
      calls,
      approvals: [],
      flows,
      constraints: {},
      metadata: { systems: ["refuje", "railgun"], integration: "key-to-shielded", refujeKey: input.refuje.path, railgunUtxo: input.railgun.utxo },
    }, 0);
  }

  shieldedToKey(input: ShieldedToKeyInput): RecipePlan {
    const calls: RecipeCall[] = [
      { chainId: input.railgun.chainId, target: input.railgun.railgunAddress, calldata: "0xddccbbaa", value: "0", description: "RAILGUN unshield" },
      { chainId: input.refuje.chainId, target: input.refuje.refujeAddress, calldata: "0x11223344", value: "0", description: "Refuje key deposit" },
    ];
    const flows: RecipeAssetFlow[] = [
      { direction: "input", asset: { kind: "erc20", chainId: input.railgun.chainId, token: input.railgun.token }, amount: input.railgun.amount, owner: input.railgun.railgunAddress },
      ...input.refuje.flows,
    ];
    return normalizePlan({
      schemaVersion: 1,
      pluginId: "refuje.railgun.integration",
      pluginVersion: "1.0.0",
      recipeId: `shielded-to-key.${input.integrationId}`,
      calls,
      approvals: [],
      flows,
      constraints: {},
      metadata: { systems: ["railgun", "refuje"], integration: "shielded-to-key", railgunUtxo: input.railgun.utxo, refujeKey: input.refuje.path },
    }, 0);
  }
}
