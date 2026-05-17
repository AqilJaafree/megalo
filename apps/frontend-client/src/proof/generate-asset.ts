import { AssetProofOutput } from '../types';

// Witness provider shape matching asset_proof.compact witness declarations
interface AssetWitnesses {
  local_secret_key: () => Uint8Array;
  get_liquid_assets_usd: () => bigint;
  get_illiquid_assets_usd: () => bigint;
  get_loan_amount_usd: () => bigint;
}

// Raw on-chain output returned by the Midnight runtime after proof submission
interface AssetLedgerOutput {
  asset_sufficient: boolean;
  asset_tier: bigint;
}

// Load the compiled contract runner lazily — managed/ is gitignored and built separately
async function loadAssetProofRunner(): Promise<
  (witnesses: AssetWitnesses, minLiquidRatio: number) => Promise<AssetLedgerOutput>
> {
  // Dynamic import: managed/ artifacts are produced by `compact compile` at build time
  // @ts-ignore — no type declarations until the contract is compiled
  const mod = await import('../../../packages/contract/managed/asset_proof/contract.js');
  return mod.prove_assets as (
    witnesses: AssetWitnesses,
    minLiquidRatio: number,
  ) => Promise<AssetLedgerOutput>;
}

export async function generateAssetProof(
  liquidAssetsUsd: number,
  illiquidAssetsUsd: number,
  loanAmountUsd: number,
  secretKey: Uint8Array,
  minLiquidRatioPct: number = 20,
): Promise<AssetProofOutput> {
  const witnesses: AssetWitnesses = {
    local_secret_key:       () => secretKey,
    get_liquid_assets_usd:   () => BigInt(liquidAssetsUsd),
    get_illiquid_assets_usd: () => BigInt(illiquidAssetsUsd),
    get_loan_amount_usd:     () => BigInt(loanAmountUsd),
  };

  let runner: ((witnesses: AssetWitnesses, minLiquidRatio: number) => Promise<AssetLedgerOutput>) | null;
  try {
    runner = await loadAssetProofRunner();
    const output = await runner(witnesses, minLiquidRatioPct);
    runner = null;

    const tier = Number(output.asset_tier);
    if (tier !== 1 && tier !== 2 && tier !== 3) throw new Error(`Unexpected asset tier: ${tier}`);

    return {
      assetSufficient: output.asset_sufficient,
      assetTier: tier as 1 | 2 | 3,
    };
  } catch (err) {
    runner = null;
    throw new Error(
      `generateAssetProof failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
