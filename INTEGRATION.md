# Midvault — TypeScript Integration Spec

> **Claude Code instructions:** Implement all modules below under `src/` using TypeScript strict mode.
> Use the Midnight.js SDK for contract interaction. Use the Anthropic SDK for all Claude API calls.
> Never log, store, or transmit raw financial figures — only structured feature objects and proof outputs.
> All Claude calls must go through the wrapper functions defined here; never call the API directly elsewhere.

---

## Project structure

```
src/
  ai/
    parse-document.ts      # Claude: extract features from TradFi documents
    price-loan.ts          # Claude: recommend APR from proof tier + pool state + attestation
    explain-score.ts       # Claude: generate borrower-facing score explanation
    summarise-applicant.ts # Claude: generate lender-facing applicant summary
    analyse-cohort.ts      # Claude: monthly cohort analysis → weight recommendations
  ingestion/
    plaid.ts               # Plaid Link integration — open banking OAuth (US)
    open-banking.ts        # PSD2 open banking OAuth (UK / EU)
    upload.ts              # Direct PDF upload handler — routes to parse-document
  proof/
    generate-credit.ts     # Build witness inputs, call credit_proof circuit
    generate-asset.ts      # Build witness inputs, call asset_proof circuit
    verify.ts              # Verify proof locally before submission
  contract/
    lending-pool.ts        # TypeScript wrapper for lending_pool.compact
    governance.ts          # TypeScript wrapper for governance.compact
  types/
    index.ts               # All shared types
  config.ts                # Environment and weight constants
```

---

## `src/types/index.ts`

```typescript
// Raw features extracted by Claude — NEVER persisted or logged
// Field names updated for TradFi: epf → creditUtilisation, walletActivity → assetSufficiency
export interface CreditFeatures {
  avgMonthlyIncomeScore: number;      // 0–100, from pay stub / tax return / P&L
  debtRatioScore: number;             // 0–100, from credit bureau or open banking
  paymentHistoryScore: number;        // 0–100, from credit bureau or bank statement
  cashflowVolatilityScore: number;    // 0–100, from open banking cashflow analysis
  creditUtilisationScore: number;     // 0–100, from credit bureau utilisation rate
  assetSufficiencyScore: number;      // 0–100, from brokerage/pension; default 50 if absent
}

export type CreditGrade = 'A' | 'B' | 'C' | 'rejected';

// Document source types accepted
export type DocumentSource =
  | 'plaid'           // US open banking
  | 'open_banking'    // UK/EU PSD2
  | 'pay_stub'        // PDF upload
  | 'w2'              // PDF upload
  | 'tax_return'      // PDF upload
  | 'pl_statement'    // PDF upload — self-employed / business
  | 'brokerage'       // PDF upload — assets
  | 'pension'         // PDF upload — assets
  | 'credit_bureau';  // PDF upload — Experian / Equifax export

// Whether inputs were bank-signed via open banking OAuth + TEE
export interface AttestationStatus {
  attested: boolean;
  provider?: 'plaid' | 'open_banking';  // undefined if attested=false
  attestedAt?: Date;
}

// What the ZK circuit publishes on-chain
export interface CreditProofOutput {
  grade: CreditGrade;
  isEligible: boolean;
  scoreHash: `0x${string}`;
  attested: boolean;
}

export interface AssetProofOutput {
  assetSufficient: boolean;
  assetTier: 1 | 2 | 3;
}

// Claude's loan pricing output
export interface LoanPricingOutput {
  aprBps: number;             // e.g. 840 = 8.4%
  maxTermMonths: number;      // up to 60 for TradFi
  maxPrincipal: number;       // in USD
  requiresAssetProof: boolean;
  rationale: string;          // shown to borrower, qualitative only, no numbers
}

// Claude's borrower explanation output
export interface ScoreExplanation {
  summary: string;
  factors: {
    label: 'Income stability' | 'Payment record' | 'Existing commitments';
    quality: 'High' | 'Good' | 'Moderate' | 'Low';
  }[];
}

// Claude's lender-facing applicant summary
export interface ApplicantSummary {
  anonymousId: string;
  grade: CreditGrade;
  attested: boolean;
  summary: string;              // 1 sentence, qualitative only
  dataSources: DocumentSource[]; // list of source types used — not the data
  recommendedAprBps: number;
  maxPrincipal: number;
}

// Aggregate cohort data — no individual records ever
export interface CohortStats {
  periodStart: Date;
  periodEnd: Date;
  byGrade: {
    grade: CreditGrade;
    attested: boolean;
    loansIssued: number;
    defaultRate: number;
    avgTermMonths: number;
  }[];
}

export interface WeightRecommendation {
  newWeights: {
    income: number;
    debt: number;
    payments: number;
    cashflow: number;
    utilisation: number;
    assets: number;
  };
  confidence: number;
  rationale: string;
}

export interface LoanState {
  loanId: `0x${string}`;
  grade: CreditGrade;
  principal: number;
  aprBps: number;
  termMonths: number;
  disbursedAt: Date;
  repaid: boolean;
  defaulted: boolean;
  scoreHash: `0x${string}`;
  attested: boolean;
}

export interface PoolState {
  totalLiquidity: number;
  utilisationBps: number;
}
```

---

## `src/config.ts`

```typescript
import { MidnightConfig } from '@midnight-ntwrk/midnight-js-network-id';

export const MIDNIGHT_CONFIG: MidnightConfig = {
  networkId: process.env.MIDNIGHT_NETWORK_ID as 'testnet' | 'mainnet',
  rpcUrl: process.env.MIDNIGHT_RPC_URL!,
  proofServerUrl: process.env.MIDNIGHT_PROOF_SERVER_URL!,
};

export const CONTRACT_ADDRESSES = {
  lendingPool: process.env.LENDING_POOL_ADDRESS! as `0x${string}`,
  governance: process.env.GOVERNANCE_ADDRESS! as `0x${string}`,
};

export const ANTHROPIC_MODEL = 'claude-sonnet-4-20250514';

// Grade → APR band in basis points — two sets: attested vs standard
// Must mirror grade_rate_band() in lending_pool.compact exactly
export const GRADE_RATE_BANDS = {
  attested: {
    A: [350, 650] as [number, number],
    B: [650, 950] as [number, number],
    C: [950, 1300] as [number, number],
  },
  standard: {
    A: [500, 800] as [number, number],
    B: [800, 1100] as [number, number],
    C: [1100, 1500] as [number, number],
  },
} as const;

export const MAX_TERM_MONTHS = 60;
export const DEFAULT_ASSET_SCORE = 50; // neutral default when no asset docs provided
```

---

## `src/ai/parse-document.ts`

Parses TradFi documents into structured `CreditFeatures`. Accepts PDF base64 or structured open banking JSON. Raw content is processed in memory only and never stored.

```typescript
import Anthropic from '@anthropic-ai/sdk';
import { CreditFeatures, DocumentSource } from '../types';
import { ANTHROPIC_MODEL, DEFAULT_ASSET_SCORE } from '../config';

const client = new Anthropic();

function buildSystemPrompt(source: DocumentSource): string {
  const sourceHints: Record<DocumentSource, string> = {
    plaid:        'open banking JSON with transaction history and account balances',
    open_banking: 'PSD2 open banking JSON with transaction history and account balances',
    pay_stub:     'employee pay stub showing gross pay, deductions, and net pay',
    w2:           'US W-2 tax form showing annual wages and withholdings',
    tax_return:   'self-assessment or corporate tax return showing declared income',
    pl_statement: 'profit and loss statement showing revenue, expenses, and net income',
    brokerage:    'brokerage account statement showing holdings and total value',
    pension:      'pension or retirement account statement showing fund value',
    credit_bureau:'credit bureau report showing payment history, utilisation, and accounts',
  };

  return `You are a financial feature extractor for a private lending system.
You receive a ${sourceHints[source]}.
Your only job is to output a JSON object with exactly these keys:
  avgMonthlyIncomeScore, debtRatioScore, paymentHistoryScore,
  cashflowVolatilityScore, creditUtilisationScore, assetSufficiencyScore

Each value is an integer from 0 to 100. Higher = better creditworthiness.
For fields not determinable from this document type, output ${DEFAULT_ASSET_SCORE} as a neutral default.

Scoring guidance by field:
- avgMonthlyIncomeScore: higher for stable, higher income relative to loan norms
- debtRatioScore: higher for LOWER debt-to-income (inverse — low debt = high score)
- paymentHistoryScore: higher for zero missed payments, longer history
- cashflowVolatilityScore: higher for LOWER month-to-month cashflow variance (inverse)
- creditUtilisationScore: higher for LOWER credit utilisation (inverse)
- assetSufficiencyScore: higher for larger liquid assets relative to typical loan sizes

Rules:
- Output raw JSON only. No markdown, no explanation, no preamble.
- Do NOT repeat, quote, or reference any specific figures from the document.
- Do NOT include any names, account numbers, tax IDs, or identifiers.
- If a field cannot be determined from this document type, output ${DEFAULT_ASSET_SCORE}.`;
}

export async function parseDocument(
  documentBase64: string,
  mediaType: 'application/pdf',
  source: DocumentSource,
): Promise<CreditFeatures> {
  const response = await client.messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: 256,
    system: buildSystemPrompt(source),
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'document',
            source: { type: 'base64', media_type: mediaType, data: documentBase64 },
          },
          { type: 'text', text: 'Extract the credit features from this document.' },
        ],
      },
    ],
  });

  const raw = response.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as { type: 'text'; text: string }).text)
    .join('');

  const parsed = JSON.parse(raw) as CreditFeatures;

  return {
    avgMonthlyIncomeScore:   clamp(parsed.avgMonthlyIncomeScore),
    debtRatioScore:          clamp(parsed.debtRatioScore),
    paymentHistoryScore:     clamp(parsed.paymentHistoryScore),
    cashflowVolatilityScore: clamp(parsed.cashflowVolatilityScore),
    creditUtilisationScore:  clamp(parsed.creditUtilisationScore),
    assetSufficiencyScore:   clamp(parsed.assetSufficiencyScore),
  };
}

// Merge multiple document extractions — take the max of each field
// (conservative: always surface the best available signal)
export function mergeFeatures(extractions: CreditFeatures[]): CreditFeatures {
  if (extractions.length === 0) throw new Error('No feature extractions to merge');
  return {
    avgMonthlyIncomeScore:   Math.max(...extractions.map((e) => e.avgMonthlyIncomeScore)),
    debtRatioScore:          Math.max(...extractions.map((e) => e.debtRatioScore)),
    paymentHistoryScore:     Math.max(...extractions.map((e) => e.paymentHistoryScore)),
    cashflowVolatilityScore: Math.max(...extractions.map((e) => e.cashflowVolatilityScore)),
    creditUtilisationScore:  Math.max(...extractions.map((e) => e.creditUtilisationScore)),
    assetSufficiencyScore:   Math.max(...extractions.map((e) => e.assetSufficiencyScore)),
  };
}

function clamp(n: unknown): number {
  const num = typeof n === 'number' ? n : DEFAULT_ASSET_SCORE;
  return Math.max(0, Math.min(100, Math.round(num)));
}
```

---

## `src/ai/price-loan.ts`

Recommends an APR and loan terms. Attested loans are eligible for the tighter (lower-ceiling) rate band.

```typescript
import Anthropic from '@anthropic-ai/sdk';
import { CreditGrade, LoanPricingOutput, PoolState } from '../types';
import { ANTHROPIC_MODEL, GRADE_RATE_BANDS, MAX_TERM_MONTHS } from '../config';

const client = new Anthropic();

export async function priceLoan(
  grade: CreditGrade,
  attested: boolean,
  requestedPrincipal: number,
  requestedTermMonths: number,
  pool: PoolState,
  baseMacroRateBps: number,
): Promise<LoanPricingOutput> {
  if (grade === 'rejected') throw new Error('Cannot price loan for rejected grade');

  const bands = attested ? GRADE_RATE_BANDS.attested : GRADE_RATE_BANDS.standard;
  const [minBps, maxBps] = bands[grade];

  const systemPrompt = `You are a lending rate engine for Midvault, a private credit platform for traditional finance borrowers.
You receive a borrower's credit grade, attestation status, and current pool conditions.
Output a JSON object with exactly these keys:
  aprBps            (integer, basis points, must be between ${minBps} and ${maxBps})
  maxTermMonths     (integer, 1–${MAX_TERM_MONTHS})
  maxPrincipal      (integer, USD)
  requiresAssetProof (boolean — true if loan size warrants asset verification)
  rationale         (string, 1 sentence, plain English, no numbers, no financial jargon)

Rules:
- Output raw JSON only.
- aprBps MUST be within ${minBps}–${maxBps} for grade ${grade} (${attested ? 'attested' : 'standard'}).
- Higher pool utilisation should push apr toward the upper bound.
- Attested borrowers signal bank-verified data — factor this into confidence.
- rationale is shown to the borrower — write calmly and clearly. No jargon.`;

  const response = await client.messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: 256,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: JSON.stringify({
          grade,
          attested,
          requestedPrincipal,
          requestedTermMonths,
          poolUtilisationBps: pool.utilisationBps,
          poolLiquidity: pool.totalLiquidity,
          baseMacroRateBps,
        }),
      },
    ],
  });

  const raw = response.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as { type: 'text'; text: string }).text)
    .join('');

  const result = JSON.parse(raw) as LoanPricingOutput;
  result.aprBps = Math.max(minBps, Math.min(maxBps, result.aprBps));

  return result;
}
```

---

## `src/ai/explain-score.ts`

Generates a borrower-facing explanation using TradFi-appropriate factor labels. No jargon. No numbers.

```typescript
import Anthropic from '@anthropic-ai/sdk';
import { CreditGrade, ScoreExplanation } from '../types';
import { ANTHROPIC_MODEL } from '../config';

const client = new Anthropic();

const SYSTEM_PROMPT = `You are writing a short, clear explanation of a borrower's credit score for Midvault.
Output a JSON object with exactly these keys:
  summary  (string, 1–2 sentences, warm and direct, no numbers, no jargon)
  factors  (array of exactly 3 objects: { label: string, quality: "High"|"Good"|"Moderate"|"Low" })

The three factor labels must be exactly:
  "Income stability", "Payment record", "Existing commitments"

Rules:
- Output raw JSON only.
- Do not mention the grade letter.
- Do not use words like: zero-knowledge, cryptographic, proof, circuit, blockchain, Midnight.
- Do not mention specific figures or ratios.
- Write as if talking to a professional who is not a finance expert.
- "Existing commitments" refers to current debt load — use plain phrasing.`;

export async function explainScore(
  grade: CreditGrade,
  qualitativeHints: {
    incomeStability: 'High' | 'Good' | 'Moderate' | 'Low';
    paymentRecord: 'High' | 'Good' | 'Moderate' | 'Low';
    existingCommitments: 'High' | 'Good' | 'Moderate' | 'Low';
  },
): Promise<ScoreExplanation> {
  const response = await client.messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: 256,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: JSON.stringify({ grade, qualitativeHints }) }],
  });

  const raw = response.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as { type: 'text'; text: string }).text)
    .join('');

  return JSON.parse(raw) as ScoreExplanation;
}
```

---

## `src/ai/summarise-applicant.ts`

Lender-facing summary. Includes attestation status and data source types — never the data itself.

```typescript
import Anthropic from '@anthropic-ai/sdk';
import { ApplicantSummary, CreditGrade, DocumentSource, LoanPricingOutput } from '../types';
import { ANTHROPIC_MODEL } from '../config';

const client = new Anthropic();

const SYSTEM_PROMPT = `You are generating brief applicant summaries for a lender dashboard at Midvault.
Output a JSON object with exactly one key:
  summary (string, exactly 1 sentence, qualitative only, no numbers, no jargon)

Rules:
- Output raw JSON only.
- Do not include the grade letter in the summary text.
- Do not use words like: zero-knowledge, proof, circuit, blockchain, collateral, LTV.
- For attested applicants (bank-verified data): lead with the attestation signal.
- For grade A: 2–3 positive signals.
- For grade B or C: 2 positive signals and 1 note of caution.`;

export async function summariseApplicant(
  anonymousId: string,
  grade: CreditGrade,
  attested: boolean,
  dataSources: DocumentSource[],
  pricing: LoanPricingOutput,
  assetTier: 1 | 2 | 3,
): Promise<ApplicantSummary> {
  const response = await client.messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: 128,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: JSON.stringify({ grade, attested, assetTier, termMonths: pricing.maxTermMonths }),
      },
    ],
  });

  const raw = response.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as { type: 'text'; text: string }).text)
    .join('');

  const { summary } = JSON.parse(raw) as { summary: string };

  return {
    anonymousId,
    grade,
    attested,
    summary,
    dataSources,
    recommendedAprBps: pricing.aprBps,
    maxPrincipal: pricing.maxPrincipal,
  };
}
```

---

## `src/ai/analyse-cohort.ts`

Monthly cohort analysis. Compares attested vs non-attested loan performance separately — the attested rate band justification must hold over time.

```typescript
import Anthropic from '@anthropic-ai/sdk';
import { CohortStats, WeightRecommendation } from '../types';
import { ANTHROPIC_MODEL } from '../config';

const client = new Anthropic();

const SYSTEM_PROMPT = `You are a credit model analyst for Midvault, a private lending platform for traditional finance borrowers.
You receive aggregate repayment statistics split by grade and attestation status (no individual borrower data).

Output a JSON object with exactly these keys:
  newWeights  ({ income, debt, payments, cashflow, utilisation, assets } — all integers, must sum to 100)
  confidence  (number, 0.0–1.0)
  rationale   (string, 2–3 sentences, plain English, suitable for a governance proposal on-chain)

Rules:
- Output raw JSON only.
- Weights must sum to exactly 100.
- Six weight fields: income, debt, payments, cashflow, utilisation, assets.
- Only recommend changes if a grade's default rate has deviated >20% from its historical baseline.
- If attested loans are outperforming standard loans significantly, consider increasing asset weight.
- If no change is warranted, return current weights unchanged with confidence < 0.5.
- rationale will be hashed and stored on-chain — write it as a formal, auditable statement.`;

export async function analyseCohort(
  cohort: CohortStats,
  currentWeights: WeightRecommendation['newWeights'],
): Promise<WeightRecommendation> {
  const response = await client.messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: 512,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: JSON.stringify({ cohort, currentWeights }) }],
  });

  const raw = response.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as { type: 'text'; text: string }).text)
    .join('');

  const result = JSON.parse(raw) as WeightRecommendation;

  const sum = Object.values(result.newWeights).reduce((a, b) => a + b, 0);
  if (sum !== 100) throw new Error(`Weight sum invalid: ${sum}`);

  return result;
}
```

---

## `src/contract/lending-pool.ts`

Updated wrapper — `attested` flag passed through to `request_loan`.

```typescript
import { MidnightProvider } from '@midnight-ntwrk/midnight-js-network-id';
import {
  CreditProofOutput,
  AssetProofOutput,
  LoanPricingOutput,
  LoanState,
  PoolState,
} from '../types';
import { CONTRACT_ADDRESSES } from '../config';

export async function getPoolState(provider: MidnightProvider): Promise<PoolState> {
  const state = await provider.queryContractState(CONTRACT_ADDRESSES.lendingPool);
  return {
    totalLiquidity: Number(state.total_liquidity),
    utilisationBps: Number(state.utilisation),
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
    grade: uint8ToGrade(Number(loan.borrower_grade)),
    principal: Number(loan.principal),
    aprBps: Number(loan.apr_bps),
    termMonths: Number(loan.term_months),
    disbursedAt: new Date(Number(loan.disbursed_at) * 1000),
    repaid: Boolean(loan.repaid),
    defaulted: Boolean(loan.defaulted),
    scoreHash: loan.score_hash as `0x${string}`,
    attested: Boolean(loan.attested),
  };
}

function gradeToUint8(grade: string): number {
  return { A: 1, B: 2, C: 3, rejected: 0 }[grade] ?? 0;
}

function uint8ToGrade(n: number): 'A' | 'B' | 'C' | 'rejected' {
  return ({ 1: 'A', 2: 'B', 3: 'C', 0: 'rejected' } as const)[n] ?? 'rejected';
}
```

---

## Environment variables required

```env
MIDNIGHT_NETWORK_ID=testnet
MIDNIGHT_RPC_URL=https://rpc.testnet.midnight.network
MIDNIGHT_PROOF_SERVER_URL=https://proof.testnet.midnight.network
LENDING_POOL_ADDRESS=0x...
GOVERNANCE_ADDRESS=0x...
ANTHROPIC_API_KEY=sk-ant-...
PLAID_CLIENT_ID=...
PLAID_SECRET=...
PLAID_ENV=sandbox
OPEN_BANKING_CLIENT_ID=...
OPEN_BANKING_CLIENT_SECRET=...
```

---

## Constraints for Claude Code

- Strict TypeScript (`"strict": true` in tsconfig)
- Never assign `any` — use `unknown` and narrow
- All Claude calls must be wrapped in try/catch; throw typed errors on failure
- Raw `CreditFeatures` must be garbage-collected immediately after `generateCreditProof` returns
- `parseDocument` receives base64 only — never a file path or raw text
- `mergeFeatures` must be called when multiple documents are uploaded — never average scores manually
- All monetary values are integers (cents or basis points) — never use `float` for money
- `attested` flag must originate from the proof server or Plaid/open banking OAuth response — never from user input
- The six weight fields in `WeightRecommendation.newWeights` must always sum to 100 before being passed to governance
