import { CreditProofOutput, AssetProofOutput, LoanPricingOutput, LoanState, PoolState, CreditGrade } from '../types';

export async function getPoolState(): Promise<PoolState> {
  const res = await fetch('/api/contract/pool', { cache: 'no-store' });
  if (!res.ok) throw new Error(`getPoolState failed: ${res.statusText}`);
  return res.json() as Promise<PoolState>;
}

export async function requestLoan(
  creditProof: CreditProofOutput,
  assetProof: AssetProofOutput,
  pricing: LoanPricingOutput,
  principal: number,
): Promise<`0x${string}`> {
  if (!creditProof.isEligible) throw new Error('Borrower not eligible');
  if (pricing.requiresAssetProof && !assetProof.assetSufficient) {
    throw new Error('Asset verification required but not met');
  }

  const res = await fetch('/api/contract/request-loan', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      grade:        creditProof.grade,
      isEligible:   creditProof.isEligible,
      scoreHash:    creditProof.scoreHash,
      attested:     creditProof.attested,
      principalUsd: principal,
      aprBps:       pricing.aprBps,
      termMonths:   pricing.maxTermMonths,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(`requestLoan failed: ${(err as { error: string }).error}`);
  }

  const data = await res.json() as { loanId: `0x${string}` };
  return data.loanId;
}

export async function repayLoan(loanId: `0x${string}`, amount: number): Promise<void> {
  const res = await fetch('/api/contract/repay-loan', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ loanId, amount }),
  });
  if (!res.ok) throw new Error(`repayLoan failed: ${res.statusText}`);
}

export async function getLoan(loanId: `0x${string}`): Promise<LoanState> {
  const res = await fetch(`/api/contract/loan/${loanId}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`getLoan failed: ${res.statusText}`);
  return res.json() as Promise<LoanState>;
}

function uint8ToGrade(n: number): CreditGrade {
  const map: Record<number, CreditGrade> = { 1: 'A', 2: 'B', 3: 'C', 0: 'rejected' };
  return map[n] ?? 'rejected';
}
