/**
 * Admin endpoint — seeds the lending pool with initial liquidity.
 * Called once after deploy; not exposed in the borrower UI.
 */
import { NextRequest, NextResponse } from 'next/server';
import { pathToFileURL } from 'node:url';

import { CompiledContract } from '@midnight-ntwrk/compact-js';
import { findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';

import { CONTRACT_ADDRESSES } from '../../../../config';
import { getMidnightProviders, managedPath } from '../../../../lib/midnight-provider';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const body = await req.json() as { amountUsd: number };
  const { amountUsd } = body;

  if (!amountUsd || amountUsd <= 0) {
    return NextResponse.json({ error: 'amountUsd must be positive' }, { status: 400 });
  }

  try {
    const providers   = await getMidnightProviders();
    const contractPath = managedPath('lending_pool');
    const mod = await import(pathToFileURL(`${contractPath}/contract/index.js`).href);

    const witnesses = {
      local_secret_key:  (_c: unknown) => [_c, providers.secretKeyBytes],
      current_block:     (_c: unknown) => [_c, 0n],
      initial_threshold: (_c: unknown) => [_c, 1n],
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const compiled = (CompiledContract.make('lending_pool', mod.Contract) as any).pipe(
  
    (CompiledContract.withWitnesses as any)(witnesses),
      (CompiledContract.withCompiledFileAssets as any)(contractPath),
    ) as any;

    const contractProviders = {
      privateStateProvider: providers.privateStateProvider('lending-pool-deposit-state'),
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
        contractAddress:     CONTRACT_ADDRESSES.lendingPool,
        privateStateId:      'lending-pool-deposit-state',
        initialPrivateState: {},
      },
    );

    await contract.callTx.deposit_liquidity(BigInt(amountUsd));

    return NextResponse.json({ ok: true, deposited: amountUsd });
  } catch (err) {
    console.error('[deposit-liquidity] error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
