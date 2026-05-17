import { NextResponse } from 'next/server';
import { pathToFileURL } from 'node:url';

import { getPublicStates } from '@midnight-ntwrk/midnight-js-contracts';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';

import { MIDNIGHT_CONFIG, CONTRACT_ADDRESSES } from '../../../../config';
import { managedPath } from '../../../../lib/midnight-provider';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    setNetworkId(MIDNIGHT_CONFIG.networkId);

    const publicDataProvider = indexerPublicDataProvider(
      MIDNIGHT_CONFIG.indexerUrl,
      MIDNIGHT_CONFIG.indexerWsUrl,
    );

    const { contractState } = await getPublicStates(
      publicDataProvider,
      CONTRACT_ADDRESSES.lendingPool,
    );

    const contractPath = pathToFileURL(
      `${managedPath('lending_pool')}/contract/index.js`,
    ).href;
    const mod = await import(contractPath);
    const state = mod.ledger(contractState);

    const totalLiquidity = Number(state.total_liquidity);
    const totalLent      = Number(state.total_lent);
    const utilisationBps = totalLiquidity > 0
      ? Math.round((totalLent / (totalLiquidity + totalLent)) * 10000)
      : 0;

    return NextResponse.json({ totalLiquidity, totalLent, utilisationBps });
  } catch (err) {
    console.error('[pool] error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
