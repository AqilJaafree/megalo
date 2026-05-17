import { AssetProofOutput } from '../types';

export async function generateAssetProof(
  liquidAssetsUsd: number,
  illiquidAssetsUsd: number,
  loanAmountUsd: number,
  _secretKey: Uint8Array,
  minLiquidRatioPct: number = 20,
): Promise<AssetProofOutput> {
  const res = await fetch('/api/contract/prove-assets', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ liquidAssetsUsd, illiquidAssetsUsd, loanAmountUsd, minLiquidRatioPct }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(`generateAssetProof failed: ${(err as { error: string }).error}`);
  }

  return res.json() as Promise<AssetProofOutput>;
}
