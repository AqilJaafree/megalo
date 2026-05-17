import {
  CreditProofOutput,
  AssetProofOutput,
  LoanPricingOutput,
  LoanState,
  PoolState,
  CreditGrade,
} from '../types';
import { CONTRACT_ADDRESSES } from '../config';

// Minimal provider interface — implemented by the Midnight.js SDK at runtime
export interface MidnightProvider {
  queryContractState(address: `0x${string}`, path?: string): Promise<Record<string, unknown>>;
  callContract(
    address: `0x${string}`,
    method: string,
    args: Record<string, unknown>,
  ): Promise<{ transactionHash: string }>;
}

export async function getPoolState(provider: MidnightProvider): Promise<PoolState> {
  const state = await provider.queryContractState(CONTRACT_ADDRESSES.lendingPool);
  return {
    totalLiquidity: Number(state['total_liquidity']),
    utilisationBps: Number(state['utilisation']),
  };
}

export async function requestLoan(
  creditProof: CreditProofOutput,
  assetProof: AssetProofOutput,
  pricing: LoanPricingOutput,
  principal: number,
  provider: MidnightProvider,
): Promise<`0x${string}`> {
  if (!creditProof.isEligible) throw new Error('Borrower not eligible');
  if (pricing.requiresAssetProof && !assetProof.assetSufficient) {
    throw new Error('Asset verification required but not met');
  }

  const tx = await provider.callContract(CONTRACT_ADDRESSES.lendingPool, 'request_loan', {
    grade: gradeToUint8(creditProof.grade),
    is_eligible: creditProof.isEligible,
    score_hash: creditProof.scoreHash,
    attested: creditProof.attested,
    principal: BigInt(principal),
    apr_bps: pricing.aprBps,
    term_months: pricing.maxTermMonths,
  });

  return tx.transactionHash as `0x${string}`;
}

export async function repayLoan(
  loanId: `0x${string}`,
  amount: number,
  provider: MidnightProvider,
): Promise<void> {
  await provider.callContract(CONTRACT_ADDRESSES.lendingPool, 'repay_loan', {
    loan_id: loanId,
    amount: BigInt(amount),
  });
}

export async function getLoan(
  loanId: `0x${string}`,
  provider: MidnightProvider,
): Promise<LoanState> {
  const loan = await provider.queryContractState(
    CONTRACT_ADDRESSES.lendingPool,
    `loans.${loanId}`,
  );
  return {
    loanId,
    grade: uint8ToGrade(Number(loan['borrower_grade'])),
    principal: Number(loan['principal']),
    aprBps: Number(loan['apr_bps']),
    termMonths: Number(loan['term_months']),
    disbursedAt: new Date(Number(loan['disbursed_at']) * 1000),
    repaid: Boolean(loan['repaid']),
    defaulted: Boolean(loan['defaulted']),
    scoreHash: loan['score_hash'] as `0x${string}`,
    attested: Boolean(loan['attested']),
  };
}

function gradeToUint8(grade: CreditGrade): number {
  return { A: 1, B: 2, C: 3, rejected: 0 }[grade] ?? 0;
}

function uint8ToGrade(n: number): CreditGrade {
  const map: Record<number, CreditGrade> = { 1: 'A', 2: 'B', 3: 'C', 0: 'rejected' };
  return map[n] ?? 'rejected';
}
