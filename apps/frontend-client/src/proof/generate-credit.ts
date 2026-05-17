import { CreditFeatures, CreditProofOutput, AttestationStatus, CreditGrade } from '../types';

// Witness provider shape matching credit_proof.compact witness declarations
interface CreditWitnesses {
  local_secret_key: () => Uint8Array;
  get_income_score: () => bigint;
  get_debt_score: () => bigint;
  get_payments_score: () => bigint;
  get_cashflow_score: () => bigint;
  get_utilisation_score: () => bigint;
  get_assets_score: () => bigint;
}

// Raw on-chain output returned by the Midnight runtime after proof submission
interface CreditLedgerOutput {
  grade: bigint;
  is_eligible: boolean;
  score_hash: string;
}

// Load the compiled contract runner lazily — managed/ is gitignored and built separately
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
async function loadCreditProofRunner(): Promise<
  (witnesses: CreditWitnesses, attested: boolean) => Promise<CreditLedgerOutput>
> {
  // Dynamic import: managed/ artifacts are produced by `compact compile` at build time
  // @ts-ignore — no type declarations until the contract is compiled
  const mod = await import('../../../packages/contract/managed/credit_proof/contract.js');
  return mod.prove_credit as (
    witnesses: CreditWitnesses,
    attested: boolean,
  ) => Promise<CreditLedgerOutput>;
}

export async function generateCreditProof(
  features: CreditFeatures,
  secretKey: Uint8Array,
  attestation: AttestationStatus,
): Promise<CreditProofOutput> {
  // attested flag must originate from the proof server or OAuth response — never from user input
  const attested = attestation.attested;

  const witnesses: CreditWitnesses = {
    local_secret_key: () => secretKey,
    get_income_score:      () => BigInt(features.avgMonthlyIncomeScore),
    get_debt_score:        () => BigInt(features.debtRatioScore),
    get_payments_score:    () => BigInt(features.paymentHistoryScore),
    get_cashflow_score:    () => BigInt(features.cashflowVolatilityScore),
    get_utilisation_score: () => BigInt(features.creditUtilisationScore),
    get_assets_score:      () => BigInt(features.assetSufficiencyScore),
  };

  // Raw CreditFeatures must be garbage-collected immediately after this call
  let runner: ((witnesses: CreditWitnesses, attested: boolean) => Promise<CreditLedgerOutput>) | null;
  try {
    runner = await loadCreditProofRunner();
    const output = await runner(witnesses, attested);
    runner = null; // allow GC

    return {
      grade: uint8ToGrade(Number(output.grade)),
      isEligible: output.is_eligible,
      scoreHash: output.score_hash as `0x${string}`,
      attested,
    };
  } catch (err) {
    runner = null;
    throw new Error(
      `generateCreditProof failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

function uint8ToGrade(n: number): CreditGrade {
  const map: Record<number, CreditGrade> = { 1: 'A', 2: 'B', 3: 'C', 0: 'rejected' };
  return map[n] ?? 'rejected';
}
