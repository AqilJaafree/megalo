import { NextRequest, NextResponse } from 'next/server';
import { pathToFileURL } from 'node:url';

import { CompiledContract } from '@midnight-ntwrk/compact-js';
import { findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';

import { CONTRACT_ADDRESSES } from '../../../../config';
import { getMidnightProviders, managedPath } from '../../../../lib/midnight-provider';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

function computeAssetResult(
  liquidUsd: number,
  illiquidUsd: number,
  loanUsd: number,
  minLiquidRatioPct: number,
): { assetSufficient: boolean; assetTier: 1 | 2 | 3 } {
  // Ratio check without division: liquid * 100 >= loan * minLiquidRatioPct
  const assetSufficient = liquidUsd * 100 >= loanUsd * minLiquidRatioPct;

  // Tier: 2×liquid + illiquid
  const combined2 = liquidUsd * 2 + illiquidUsd;
  const assetTier: 1 | 2 | 3 =
    combined2 >= 500_000 ? 3 :
    combined2 >= 100_000 ? 2 : 1;

  return { assetSufficient, assetTier };
}

async function submitProveAssetsTx(
  liquidUsd: number,
  illiquidUsd: number,
  loanUsd: number,
  minLiquidRatioPct: number,
  secretKeyBytes: Uint8Array,
  providers: Awaited<ReturnType<typeof getMidnightProviders>>,
): Promise<void> {
  const contractPath = managedPath('asset_proof');
  const mod = await import(pathToFileURL(`${contractPath}/contract/index.js`).href);

  const witnesses = {
    local_secret_key:        (_c: unknown) => [_c, secretKeyBytes],
    get_liquid_assets_usd:   (_c: unknown) => [_c, BigInt(liquidUsd)],
    get_illiquid_assets_usd: (_c: unknown) => [_c, BigInt(illiquidUsd)],
    get_loan_amount_usd:     (_c: unknown) => [_c, BigInt(loanUsd)],
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const compiled = (CompiledContract.make('asset_proof', mod.Contract) as any).pipe(

    (CompiledContract.withWitnesses as any)(witnesses),
    (CompiledContract.withCompiledFileAssets as any)(contractPath),
  ) as any;

  const contractProviders = {
    privateStateProvider: providers.privateStateProvider('asset-proof-call-state'),
    publicDataProvider:   providers.publicDataProvider,
    zkConfigProvider:     providers.zkConfigProvider(contractPath),
    proofProvider:        providers.proofProvider(contractPath),
    walletProvider:       providers.walletProvider,
    midnightProvider:     providers.walletProvider,
  };

  const contract = await findDeployedContract(
    contractProviders as unknown as Parameters<typeof findDeployedContract>[0],
    {
      compiledContract:    compiled,
      contractAddress:     CONTRACT_ADDRESSES.assetProof,
      privateStateId:      'asset-proof-call-state',
      initialPrivateState: {},
    },
  );

  await contract.callTx.prove_assets(minLiquidRatioPct);
}

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    liquidAssetsUsd: number;
    illiquidAssetsUsd: number;
    loanAmountUsd: number;
    minLiquidRatioPct?: number;
  };

  const {
    liquidAssetsUsd,
    illiquidAssetsUsd,
    loanAmountUsd,
    minLiquidRatioPct = 20,
  } = body;

  if (loanAmountUsd <= 0) {
    return NextResponse.json({ error: 'loanAmountUsd must be positive' }, { status: 400 });
  }

  const result = computeAssetResult(liquidAssetsUsd, illiquidAssetsUsd, loanAmountUsd, minLiquidRatioPct);

  getMidnightProviders()
    .then((p) => submitProveAssetsTx(liquidAssetsUsd, illiquidAssetsUsd, loanAmountUsd, minLiquidRatioPct, p.secretKeyBytes, p))
    .catch((err) => console.error('[prove-assets] on-chain TX failed:', err));

  return NextResponse.json(result);
}
