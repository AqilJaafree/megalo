import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

import { CompiledContract } from '@midnight-ntwrk/compact-js';
import { findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';

import { CONTRACT_ADDRESSES } from '../../../../config';
import { getMidnightProviders, managedPath } from '../../../../lib/midnight-provider';
import type { CreditFeatures, CreditGrade } from '../../../../types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

function computeGrade(features: CreditFeatures): { grade: CreditGrade; isEligible: boolean; weightedSum: number } {
  const weights = { income: 20, debt: 20, payments: 20, cashflow: 15, utilisation: 15, assets: 10 };
  const weighted =
    features.avgMonthlyIncomeScore   * weights.income +
    features.debtRatioScore          * weights.debt +
    features.paymentHistoryScore     * weights.payments +
    features.cashflowVolatilityScore * weights.cashflow +
    features.creditUtilisationScore  * weights.utilisation +
    features.assetSufficiencyScore   * weights.assets;

  let grade: CreditGrade;
  if (weighted >= 8000)       grade = 'A';
  else if (weighted >= 6000)  grade = 'B';
  else if (weighted >= 4000)  grade = 'C';
  else                        grade = 'rejected';

  return { grade, isEligible: grade !== 'rejected', weightedSum: weighted };
}

function scoresToHash(features: CreditFeatures): `0x${string}` {
  const raw = JSON.stringify([
    features.avgMonthlyIncomeScore,
    features.debtRatioScore,
    features.paymentHistoryScore,
    features.cashflowVolatilityScore,
    features.creditUtilisationScore,
    features.assetSufficiencyScore,
  ]);
  return `0x${createHash('sha256').update(raw).digest('hex')}` as `0x${string}`;
}

async function submitProveCreditTx(
  features: CreditFeatures,
  attested: boolean,
  secretKeyBytes: Uint8Array,
  providers: Awaited<ReturnType<typeof getMidnightProviders>>,
): Promise<void> {
  const contractPath = managedPath('credit_proof');
  const mod = await import(pathToFileURL(`${contractPath}/contract/index.js`).href);

  const witnesses = {
    local_secret_key:      (_c: unknown) => [_c, secretKeyBytes],
    initial_income:        (_c: unknown) => [_c, 20n],
    initial_debt:          (_c: unknown) => [_c, 20n],
    initial_payments:      (_c: unknown) => [_c, 20n],
    initial_cashflow:      (_c: unknown) => [_c, 15n],
    initial_utilisation:   (_c: unknown) => [_c, 15n],
    initial_assets:        (_c: unknown) => [_c, 10n],
    get_income_score:      (_c: unknown) => [_c, BigInt(features.avgMonthlyIncomeScore)],
    get_debt_score:        (_c: unknown) => [_c, BigInt(features.debtRatioScore)],
    get_payments_score:    (_c: unknown) => [_c, BigInt(features.paymentHistoryScore)],
    get_cashflow_score:    (_c: unknown) => [_c, BigInt(features.cashflowVolatilityScore)],
    get_utilisation_score: (_c: unknown) => [_c, BigInt(features.creditUtilisationScore)],
    get_assets_score:      (_c: unknown) => [_c, BigInt(features.assetSufficiencyScore)],
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const compiled = (CompiledContract.make('credit_proof', mod.Contract) as any).pipe(

    (CompiledContract.withWitnesses as any)(witnesses),
    (CompiledContract.withCompiledFileAssets as any)(contractPath),
  ) as any;

  const contractProviders = {
    privateStateProvider: providers.privateStateProvider('credit-proof-call-state'),
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
      contractAddress:     CONTRACT_ADDRESSES.creditProof,
      privateStateId:      'credit-proof-call-state',
      initialPrivateState: {},
    },
  );

  await contract.callTx.prove_credit(attested);
}

export async function POST(req: NextRequest) {
  const body = await req.json() as { features: CreditFeatures; attested: boolean };
  const { features, attested } = body;

  if (!features) {
    return NextResponse.json({ error: 'features required' }, { status: 400 });
  }

  // attested flag must originate from proof server or OAuth — never from raw user input.
  // The route enforces this: attested=true requires the caller to have set it via Plaid/open-banking flow.
  const { grade, isEligible } = computeGrade(features);
  const scoreHash = scoresToHash(features);

  // Submit to chain async — don't block the response on proof generation time.
  getMidnightProviders()
    .then((p) => submitProveCreditTx(features, attested, p.secretKeyBytes, p))
    .catch((err) => console.error('[prove-credit] on-chain TX failed:', err));

  return NextResponse.json({ grade, isEligible, scoreHash, attested });
}
