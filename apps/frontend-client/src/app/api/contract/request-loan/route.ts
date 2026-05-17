import { NextRequest, NextResponse } from 'next/server';
import { pathToFileURL } from 'node:url';

import { CompiledContract } from '@midnight-ntwrk/compact-js';
import { findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';

import { CONTRACT_ADDRESSES } from '../../../../config';
import { getMidnightProviders, managedPath } from '../../../../lib/midnight-provider';
import type { CreditGrade } from '../../../../types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function gradeToUint8(grade: CreditGrade): bigint {
  return grade === 'A' ? 1n : grade === 'B' ? 2n : grade === 'C' ? 3n : 0n;
}

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    grade: CreditGrade;
    isEligible: boolean;
    scoreHash: string;
    attested: boolean;
    principalUsd: number;
    aprBps: number;
    termMonths: number;
  };

  const { grade, isEligible, scoreHash, attested, principalUsd, aprBps, termMonths } = body;

  if (!isEligible) {
    return NextResponse.json({ error: 'Borrower not eligible' }, { status: 400 });
  }
  if (!scoreHash) {
    return NextResponse.json({ error: 'scoreHash required' }, { status: 400 });
  }

  try {
    const providers = await getMidnightProviders();
    const contractPath = managedPath('lending_pool');
    const mod = await import(pathToFileURL(`${contractPath}/contract/index.js`).href);

    // Convert scoreHash from hex string to Uint8Array
    const hashHex = scoreHash.startsWith('0x') ? scoreHash.slice(2) : scoreHash;
    const hashBytes = new Uint8Array(Buffer.from(hashHex.padEnd(64, '0').slice(0, 64), 'hex'));

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
      privateStateProvider: providers.privateStateProvider('lending-pool-call-state'),
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
        privateStateId:      'lending-pool-call-state',
        initialPrivateState: {},
      },
    );

    const result = await contract.callTx.request_loan(
      gradeToUint8(grade),
      isEligible,
      hashBytes,
      attested,
      BigInt(principalUsd),
      aprBps,
      termMonths,
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const loanId = `0x${Buffer.from((result as any).public?.nextContractState?.encoded ?? []).toString('hex').slice(0, 64)}` as `0x${string}`;

    return NextResponse.json({ loanId });
  } catch (err) {
    console.error('[request-loan] error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
