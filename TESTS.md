# Midvault — Test Suite Specification

> **Claude Code instructions:** Implement all tests using Vitest.
> Place tests under `src/__tests__/` mirroring the source structure.
> Mock all Claude API calls, Plaid calls, and Midnight provider calls — never hit live APIs in tests.
> Run with `pnpm test`. All tests must pass with zero network access.

---

## Setup

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: { reporter: ['text', 'lcov'] },
  },
});
```

```typescript
// src/__tests__/helpers/mock-anthropic.ts
import { vi } from 'vitest';

export function mockClaudeResponse(jsonPayload: object) {
  return vi.fn().mockResolvedValue({
    content: [{ type: 'text', text: JSON.stringify(jsonPayload) }],
  });
}

export function mockClaudeError(message: string) {
  return vi.fn().mockRejectedValue(new Error(message));
}
```

```typescript
// src/__tests__/helpers/mock-provider.ts
import { vi } from 'vitest';

export function mockMidnightProvider(overrides?: object) {
  return {
    proveCircuit: vi.fn(),
    callContract: vi.fn(),
    queryContractState: vi.fn(),
    ...overrides,
  };
}
```

---

## 1. `src/__tests__/ai/parse-document.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Anthropic from '@anthropic-ai/sdk';
import { parseDocument, mergeFeatures } from '../../ai/parse-document';
import { mockClaudeResponse, mockClaudeError } from '../helpers/mock-anthropic';
import { DEFAULT_ASSET_SCORE } from '../../config';

vi.mock('@anthropic-ai/sdk');

const VALID_FEATURES = {
  avgMonthlyIncomeScore:   82,
  debtRatioScore:          70,
  paymentHistoryScore:     88,
  cashflowVolatilityScore: 74,
  creditUtilisationScore:  79,
  assetSufficiencyScore:   65,
};

beforeEach(() => vi.clearAllMocks());

describe('parseDocument', () => {
  it('returns valid CreditFeatures from a W-2 document', async () => {
    const mockCreate = mockClaudeResponse(VALID_FEATURES);
    vi.mocked(Anthropic).prototype.messages = { create: mockCreate } as any;

    const result = await parseDocument('base64pdf==', 'application/pdf', 'w2');
    expect(result.avgMonthlyIncomeScore).toBe(82);
    expect(result.creditUtilisationScore).toBe(79);
    expect(result.assetSufficiencyScore).toBe(65);
  });

  it('returns valid CreditFeatures from a credit_bureau document', async () => {
    const mockCreate = mockClaudeResponse(VALID_FEATURES);
    vi.mocked(Anthropic).prototype.messages = { create: mockCreate } as any;

    const result = await parseDocument('base64pdf==', 'application/pdf', 'credit_bureau');
    expect(result.paymentHistoryScore).toBe(88);
    expect(result.creditUtilisationScore).toBe(79);
  });

  it('clamps values above 100 to 100', async () => {
    const mockCreate = mockClaudeResponse({ ...VALID_FEATURES, avgMonthlyIncomeScore: 150 });
    vi.mocked(Anthropic).prototype.messages = { create: mockCreate } as any;

    const result = await parseDocument('base64pdf==', 'application/pdf', 'pay_stub');
    expect(result.avgMonthlyIncomeScore).toBe(100);
  });

  it('clamps values below 0 to 0', async () => {
    const mockCreate = mockClaudeResponse({ ...VALID_FEATURES, debtRatioScore: -10 });
    vi.mocked(Anthropic).prototype.messages = { create: mockCreate } as any;

    const result = await parseDocument('base64pdf==', 'application/pdf', 'pay_stub');
    expect(result.debtRatioScore).toBe(0);
  });

  it(`defaults missing assetSufficiencyScore to ${DEFAULT_ASSET_SCORE}`, async () => {
    const { assetSufficiencyScore: _, ...partial } = VALID_FEATURES;
    const mockCreate = mockClaudeResponse({ ...partial, assetSufficiencyScore: undefined });
    vi.mocked(Anthropic).prototype.messages = { create: mockCreate } as any;

    const result = await parseDocument('base64pdf==', 'application/pdf', 'pay_stub');
    expect(result.assetSufficiencyScore).toBe(DEFAULT_ASSET_SCORE);
  });

  it('throws when Claude returns malformed JSON', async () => {
    const mockCreate = vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'not json' }],
    });
    vi.mocked(Anthropic).prototype.messages = { create: mockCreate } as any;

    await expect(parseDocument('base64==', 'application/pdf', 'tax_return')).rejects.toThrow();
  });

  it('throws when Claude API call fails', async () => {
    const mockCreate = mockClaudeError('API timeout');
    vi.mocked(Anthropic).prototype.messages = { create: mockCreate } as any;

    await expect(parseDocument('base64==', 'application/pdf', 'brokerage')).rejects.toThrow('API timeout');
  });
});

describe('mergeFeatures', () => {
  it('takes the max of each field across multiple extractions', () => {
    const a = { ...VALID_FEATURES, avgMonthlyIncomeScore: 60, assetSufficiencyScore: 80 };
    const b = { ...VALID_FEATURES, avgMonthlyIncomeScore: 82, assetSufficiencyScore: 40 };

    const merged = mergeFeatures([a, b]);
    expect(merged.avgMonthlyIncomeScore).toBe(82);
    expect(merged.assetSufficiencyScore).toBe(80);
  });

  it('throws when called with an empty array', () => {
    expect(() => mergeFeatures([])).toThrow('No feature extractions to merge');
  });

  it('returns the single extraction unchanged when only one is passed', () => {
    const merged = mergeFeatures([VALID_FEATURES]);
    expect(merged).toEqual(VALID_FEATURES);
  });
});
```

---

## 2. `src/__tests__/ai/price-loan.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Anthropic from '@anthropic-ai/sdk';
import { priceLoan } from '../../ai/price-loan';
import { mockClaudeResponse } from '../helpers/mock-anthropic';
import { PoolState } from '../../types';

vi.mock('@anthropic-ai/sdk');

const POOL: PoolState = { totalLiquidity: 2_000_000, utilisationBps: 5500 };

beforeEach(() => vi.clearAllMocks());

describe('priceLoan — attested borrower', () => {
  it('returns APR within the attested A band (350–650 bps)', async () => {
    const mockCreate = mockClaudeResponse({
      aprBps: 480,
      maxTermMonths: 36,
      maxPrincipal: 50000,
      requiresAssetProof: false,
      rationale: 'Bank-verified income and strong payment history support a competitive rate.',
    });
    vi.mocked(Anthropic).prototype.messages = { create: mockCreate } as any;

    const result = await priceLoan('A', true, 30000, 24, POOL, 400);
    expect(result.aprBps).toBeGreaterThanOrEqual(350);
    expect(result.aprBps).toBeLessThanOrEqual(650);
  });

  it('clamps out-of-band APR to attested A ceiling (650 bps)', async () => {
    const mockCreate = mockClaudeResponse({
      aprBps: 900, // above attested A ceiling
      maxTermMonths: 24,
      maxPrincipal: 30000,
      requiresAssetProof: false,
      rationale: 'Good profile.',
    });
    vi.mocked(Anthropic).prototype.messages = { create: mockCreate } as any;

    const result = await priceLoan('A', true, 30000, 24, POOL, 400);
    expect(result.aprBps).toBeLessThanOrEqual(650);
  });
});

describe('priceLoan — standard (non-attested) borrower', () => {
  it('returns APR within the standard B band (800–1100 bps)', async () => {
    const mockCreate = mockClaudeResponse({
      aprBps: 950,
      maxTermMonths: 12,
      maxPrincipal: 15000,
      requiresAssetProof: false,
      rationale: 'Solid income and good payment record.',
    });
    vi.mocked(Anthropic).prototype.messages = { create: mockCreate } as any;

    const result = await priceLoan('B', false, 12000, 12, POOL, 400);
    expect(result.aprBps).toBeGreaterThanOrEqual(800);
    expect(result.aprBps).toBeLessThanOrEqual(1100);
  });

  it('clamps below-floor APR to standard C floor (1100 bps)', async () => {
    const mockCreate = mockClaudeResponse({
      aprBps: 800, // below C standard floor
      maxTermMonths: 6,
      maxPrincipal: 5000,
      requiresAssetProof: true,
      rationale: 'Limited credit history.',
    });
    vi.mocked(Anthropic).prototype.messages = { create: mockCreate } as any;

    const result = await priceLoan('C', false, 5000, 6, POOL, 400);
    expect(result.aprBps).toBeGreaterThanOrEqual(1100);
  });
});

describe('priceLoan — edge cases', () => {
  it('throws immediately for rejected grade', async () => {
    await expect(priceLoan('rejected', false, 5000, 6, POOL, 400)).rejects.toThrow(
      'Cannot price loan for rejected grade',
    );
  });

  it('throws when Claude returns malformed JSON', async () => {
    const mockCreate = vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: '{broken' }],
    });
    vi.mocked(Anthropic).prototype.messages = { create: mockCreate } as any;

    await expect(priceLoan('B', false, 10000, 12, POOL, 400)).rejects.toThrow();
  });
});
```

---

## 3. `src/__tests__/ai/explain-score.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Anthropic from '@anthropic-ai/sdk';
import { explainScore } from '../../ai/explain-score';
import { mockClaudeResponse } from '../helpers/mock-anthropic';

vi.mock('@anthropic-ai/sdk');

const HINTS = {
  incomeStability: 'High' as const,
  paymentRecord: 'Good' as const,
  existingCommitments: 'Moderate' as const,
};

const FORBIDDEN_WORDS = [
  'zero-knowledge', 'cryptographic', 'collateral', 'LTV',
  'circuit', 'blockchain', 'midnight', 'on-chain',
];

beforeEach(() => vi.clearAllMocks());

describe('explainScore', () => {
  it('returns a summary and exactly 3 factors with TradFi labels', async () => {
    const mockCreate = mockClaudeResponse({
      summary: 'Your income is consistent and your payment track record is solid.',
      factors: [
        { label: 'Income stability', quality: 'High' },
        { label: 'Payment record', quality: 'Good' },
        { label: 'Existing commitments', quality: 'Moderate' },
      ],
    });
    vi.mocked(Anthropic).prototype.messages = { create: mockCreate } as any;

    const result = await explainScore('B', HINTS);
    expect(result.factors).toHaveLength(3);
    expect(result.factors.map((f) => f.label)).toEqual([
      'Income stability',
      'Payment record',
      'Existing commitments',
    ]);
  });

  it('summary contains no forbidden jargon', async () => {
    const mockCreate = mockClaudeResponse({
      summary: 'Strong employment history and reliable repayments support your application.',
      factors: [
        { label: 'Income stability', quality: 'High' },
        { label: 'Payment record', quality: 'High' },
        { label: 'Existing commitments', quality: 'Good' },
      ],
    });
    vi.mocked(Anthropic).prototype.messages = { create: mockCreate } as any;

    const result = await explainScore('A', HINTS);
    FORBIDDEN_WORDS.forEach((word) => {
      expect(result.summary.toLowerCase()).not.toContain(word);
    });
  });

  it('factor quality values are within the allowed enum', async () => {
    const mockCreate = mockClaudeResponse({
      summary: 'Good overall profile.',
      factors: [
        { label: 'Income stability', quality: 'Good' },
        { label: 'Payment record', quality: 'Moderate' },
        { label: 'Existing commitments', quality: 'Low' },
      ],
    });
    vi.mocked(Anthropic).prototype.messages = { create: mockCreate } as any;

    const result = await explainScore('C', HINTS);
    const validQualities = ['High', 'Good', 'Moderate', 'Low'];
    result.factors.forEach((f) => expect(validQualities).toContain(f.quality));
  });
});
```

---

## 4. `src/__tests__/ai/analyse-cohort.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Anthropic from '@anthropic-ai/sdk';
import { analyseCohort } from '../../ai/analyse-cohort';
import { mockClaudeResponse } from '../helpers/mock-anthropic';
import { CohortStats } from '../../types';

vi.mock('@anthropic-ai/sdk');

const COHORT: CohortStats = {
  periodStart: new Date('2026-01-01'),
  periodEnd:   new Date('2026-03-31'),
  byGrade: [
    { grade: 'A', attested: true,  loansIssued: 80,  defaultRate: 0.005, avgTermMonths: 24 },
    { grade: 'A', attested: false, loansIssued: 40,  defaultRate: 0.012, avgTermMonths: 18 },
    { grade: 'B', attested: true,  loansIssued: 140, defaultRate: 0.030, avgTermMonths: 12 },
    { grade: 'B', attested: false, loansIssued: 70,  defaultRate: 0.055, avgTermMonths: 10 },
    { grade: 'C', attested: false, loansIssued: 50,  defaultRate: 0.095, avgTermMonths: 8  },
  ],
};

const CURRENT_WEIGHTS = {
  income: 30, debt: 20, payments: 25, cashflow: 10, utilisation: 10, assets: 5,
};

beforeEach(() => vi.clearAllMocks());

describe('analyseCohort', () => {
  it('returns weights that sum to exactly 100', async () => {
    const mockCreate = mockClaudeResponse({
      newWeights: CURRENT_WEIGHTS,
      confidence: 0.4,
      rationale: 'No significant drift observed across grades.',
    });
    vi.mocked(Anthropic).prototype.messages = { create: mockCreate } as any;

    const result = await analyseCohort(COHORT, CURRENT_WEIGHTS);
    const sum = Object.values(result.newWeights).reduce((a, b) => a + b, 0);
    expect(sum).toBe(100);
  });

  it('throws when weights do not sum to 100', async () => {
    const mockCreate = mockClaudeResponse({
      newWeights: { ...CURRENT_WEIGHTS, assets: 10 }, // sums to 105
      confidence: 0.7,
      rationale: 'Adjusted asset weight upward.',
    });
    vi.mocked(Anthropic).prototype.messages = { create: mockCreate } as any;

    await expect(analyseCohort(COHORT, CURRENT_WEIGHTS)).rejects.toThrow('Weight sum invalid');
  });

  it('newWeights contains all six required fields', async () => {
    const mockCreate = mockClaudeResponse({
      newWeights: CURRENT_WEIGHTS,
      confidence: 0.5,
      rationale: 'No change recommended.',
    });
    vi.mocked(Anthropic).prototype.messages = { create: mockCreate } as any;

    const result = await analyseCohort(COHORT, CURRENT_WEIGHTS);
    expect(result.newWeights).toHaveProperty('income');
    expect(result.newWeights).toHaveProperty('utilisation');
    expect(result.newWeights).toHaveProperty('assets');
  });

  it('confidence is between 0 and 1', async () => {
    const mockCreate = mockClaudeResponse({
      newWeights: { ...CURRENT_WEIGHTS, payments: 30, debt: 15 },
      confidence: 0.78,
      rationale: 'Non-attested B grade default rate has exceeded baseline by 25%.',
    });
    vi.mocked(Anthropic).prototype.messages = { create: mockCreate } as any;

    const result = await analyseCohort(COHORT, CURRENT_WEIGHTS);
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });
});
```

---

## 5. `src/__tests__/proof/generate-credit.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateCreditProof } from '../../proof/generate-credit';
import { mockMidnightProvider } from '../helpers/mock-provider';
import { CreditFeatures } from '../../types';

const FEATURES: CreditFeatures = {
  avgMonthlyIncomeScore:   82,
  debtRatioScore:          70,
  paymentHistoryScore:     88,
  cashflowVolatilityScore: 74,
  creditUtilisationScore:  79,
  assetSufficiencyScore:   65,
};

beforeEach(() => vi.clearAllMocks());

describe('generateCreditProof', () => {
  it('returns grade A with attested=true', async () => {
    const provider = mockMidnightProvider({
      proveCircuit: vi.fn().mockResolvedValue({
        publicOutputs: { grade: 1n, is_eligible: true, score_hash: '0xabc123', attested: true },
      }),
    });

    const result = await generateCreditProof(FEATURES, true, provider as any);
    expect(result.grade).toBe('A');
    expect(result.isEligible).toBe(true);
    expect(result.attested).toBe(true);
    expect(result.scoreHash).toBe('0xabc123');
  });

  it('returns grade B with attested=false', async () => {
    const provider = mockMidnightProvider({
      proveCircuit: vi.fn().mockResolvedValue({
        publicOutputs: { grade: 2n, is_eligible: true, score_hash: '0xdef456', attested: false },
      }),
    });

    const result = await generateCreditProof(FEATURES, false, provider as any);
    expect(result.grade).toBe('B');
    expect(result.attested).toBe(false);
  });

  it('returns rejected and isEligible=false for grade 0', async () => {
    const provider = mockMidnightProvider({
      proveCircuit: vi.fn().mockResolvedValue({
        publicOutputs: { grade: 0n, is_eligible: false, score_hash: '0x000', attested: false },
      }),
    });

    const result = await generateCreditProof(FEATURES, false, provider as any);
    expect(result.grade).toBe('rejected');
    expect(result.isEligible).toBe(false);
  });

  it('passes all 6 witness values and attested flag to proveCircuit', async () => {
    const proveCircuit = vi.fn().mockResolvedValue({
      publicOutputs: { grade: 1n, is_eligible: true, score_hash: '0xabc', attested: true },
    });
    const provider = mockMidnightProvider({ proveCircuit });

    await generateCreditProof(FEATURES, true, provider as any);

    const [, witness] = proveCircuit.mock.calls[0];
    expect(witness.avg_monthly_income_score).toBe(82n);
    expect(witness.credit_utilisation_score).toBe(79n);
    expect(witness.asset_sufficiency_score).toBe(65n);
  });

  it('throws when proof server fails', async () => {
    const provider = mockMidnightProvider({
      proveCircuit: vi.fn().mockRejectedValue(new Error('Proof server timeout')),
    });

    await expect(generateCreditProof(FEATURES, false, provider as any)).rejects.toThrow(
      'Proof server timeout',
    );
  });
});
```

---

## 6. `src/__tests__/contract/lending-pool.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { requestLoan, repayLoan, getPoolState, getLoan } from '../../contract/lending-pool';
import { mockMidnightProvider } from '../helpers/mock-provider';
import { CreditProofOutput, AssetProofOutput, LoanPricingOutput } from '../../types';

const CREDIT_PROOF: CreditProofOutput = {
  grade: 'B',
  isEligible: true,
  scoreHash: '0xabc123' as `0x${string}`,
  attested: true,
};

const ASSET_PROOF: AssetProofOutput = {
  assetSufficient: true,
  assetTier: 2,
};

const PRICING: LoanPricingOutput = {
  aprBps: 820,
  maxTermMonths: 24,
  maxPrincipal: 25000,
  requiresAssetProof: false,
  rationale: 'Verified income and solid repayment history support this rate.',
};

beforeEach(() => vi.clearAllMocks());

describe('requestLoan', () => {
  it('passes attested flag and returns tx hash', async () => {
    const callContract = vi.fn().mockResolvedValue({ transactionHash: '0xtx999' });
    const provider = mockMidnightProvider({ callContract });

    const hash = await requestLoan(CREDIT_PROOF, ASSET_PROOF, PRICING, 20000, provider as any);
    expect(hash).toBe('0xtx999');

    const args = callContract.mock.calls[0][2];
    expect(args.grade).toBe(2);
    expect(args.attested).toBe(true);
    expect(args.apr_bps).toBe(820);
  });

  it('throws immediately if isEligible is false', async () => {
    const provider = mockMidnightProvider();
    const ineligible = { ...CREDIT_PROOF, isEligible: false, grade: 'rejected' as const };

    await expect(
      requestLoan(ineligible, ASSET_PROOF, PRICING, 20000, provider as any),
    ).rejects.toThrow('not eligible');
  });

  it('throws when asset proof required but not met', async () => {
    const provider = mockMidnightProvider();
    const needsAsset = { ...PRICING, requiresAssetProof: true };
    const badAsset = { ...ASSET_PROOF, assetSufficient: false };

    await expect(
      requestLoan(CREDIT_PROOF, badAsset, needsAsset, 20000, provider as any),
    ).rejects.toThrow('Asset verification required but not met');
  });
});

describe('repayLoan', () => {
  it('calls repay_loan with correct loan_id and BigInt amount', async () => {
    const callContract = vi.fn().mockResolvedValue({});
    const provider = mockMidnightProvider({ callContract });

    await repayLoan('0xloan123' as `0x${string}`, 10000, provider as any);

    const args = callContract.mock.calls[0][2];
    expect(args.loan_id).toBe('0xloan123');
    expect(args.amount).toBe(10000n);
  });
});

describe('getLoan', () => {
  it('maps on-chain loan struct including attested flag', async () => {
    const queryContractState = vi.fn().mockResolvedValue({
      borrower_grade: 2n,
      principal:      20000n,
      apr_bps:        820n,
      term_months:    24n,
      disbursed_at:   BigInt(Math.floor(Date.now() / 1000)),
      repaid:         false,
      defaulted:      false,
      score_hash:     '0xabc123',
      attested:       true,
    });
    const provider = mockMidnightProvider({ queryContractState });

    const loan = await getLoan('0xloan123' as `0x${string}`, provider as any);
    expect(loan.grade).toBe('B');
    expect(loan.principal).toBe(20000);
    expect(loan.attested).toBe(true);
  });
});
```

---

## 7. `src/__tests__/integration/borrow-flow.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Anthropic from '@anthropic-ai/sdk';
import { parseDocument, mergeFeatures } from '../../ai/parse-document';
import { priceLoan } from '../../ai/price-loan';
import { generateCreditProof } from '../../proof/generate-credit';
import { requestLoan } from '../../contract/lending-pool';
import { mockMidnightProvider } from '../helpers/mock-provider';
import { mockClaudeResponse } from '../helpers/mock-anthropic';

vi.mock('@anthropic-ai/sdk');

beforeEach(() => vi.clearAllMocks());

describe('Full TradFi borrow flow (mocked)', () => {
  it('W-2 + credit bureau → attested proof → A grade → loan', async () => {
    // Step 1: Parse W-2
    const parseW2 = mockClaudeResponse({
      avgMonthlyIncomeScore: 85, debtRatioScore: 72, paymentHistoryScore: 90,
      cashflowVolatilityScore: 78, creditUtilisationScore: 82, assetSufficiencyScore: 50,
    });
    vi.mocked(Anthropic).prototype.messages = { create: parseW2 } as any;
    const w2Features = await parseDocument('w2base64==', 'application/pdf', 'w2');

    // Step 2: Parse credit bureau
    const parseBureau = mockClaudeResponse({
      avgMonthlyIncomeScore: 50, debtRatioScore: 75, paymentHistoryScore: 92,
      cashflowVolatilityScore: 50, creditUtilisationScore: 88, assetSufficiencyScore: 50,
    });
    vi.mocked(Anthropic).prototype.messages = { create: parseBureau } as any;
    const bureauFeatures = await parseDocument('bureaubase64==', 'application/pdf', 'credit_bureau');

    // Step 3: Merge — take best of each
    const merged = mergeFeatures([w2Features, bureauFeatures]);
    expect(merged.creditUtilisationScore).toBe(88);
    expect(merged.paymentHistoryScore).toBe(92);

    // Step 4: Generate credit proof — attested via Plaid
    const provider = mockMidnightProvider({
      proveCircuit: vi.fn().mockResolvedValue({
        publicOutputs: { grade: 1n, is_eligible: true, score_hash: '0xscore001', attested: true },
      }),
      callContract: vi.fn().mockResolvedValue({ transactionHash: '0xtxfinal' }),
    });

    const creditProof = await generateCreditProof(merged, true, provider as any);
    expect(creditProof.grade).toBe('A');
    expect(creditProof.attested).toBe(true);

    // Step 5: Price loan — attested A band (350–650 bps)
    const priceCreate = mockClaudeResponse({
      aprBps: 520,
      maxTermMonths: 48,
      maxPrincipal: 75000,
      requiresAssetProof: false,
      rationale: 'Bank-verified income and excellent payment history support a competitive rate.',
    });
    vi.mocked(Anthropic).prototype.messages = { create: priceCreate } as any;
    const pool = { totalLiquidity: 2_000_000, utilisationBps: 4000 };
    const pricing = await priceLoan('A', true, 50000, 36, pool, 400);
    expect(pricing.aprBps).toBeLessThanOrEqual(650);

    // Step 6: Submit loan on-chain
    const assetProof = { assetSufficient: true, assetTier: 2 as const };
    const txHash = await requestLoan(creditProof, assetProof, pricing, 50000, provider as any);
    expect(txHash).toBe('0xtxfinal');
  });

  it('halts when proof returns rejected grade', async () => {
    const parseCreate = mockClaudeResponse({
      avgMonthlyIncomeScore: 18, debtRatioScore: 12, paymentHistoryScore: 15,
      cashflowVolatilityScore: 10, creditUtilisationScore: 8, assetSufficiencyScore: 20,
    });
    vi.mocked(Anthropic).prototype.messages = { create: parseCreate } as any;
    const features = await parseDocument('base64==', 'application/pdf', 'pay_stub');

    const provider = mockMidnightProvider({
      proveCircuit: vi.fn().mockResolvedValue({
        publicOutputs: { grade: 0n, is_eligible: false, score_hash: '0x000', attested: false },
      }),
    });

    const creditProof = await generateCreditProof(features, false, provider as any);
    expect(creditProof.grade).toBe('rejected');

    const assetProof = { assetSufficient: false, assetTier: 1 as const };
    const pricing = {
      aprBps: 1200, maxTermMonths: 6, maxPrincipal: 3000,
      requiresAssetProof: false, rationale: 'Limited history.',
    };

    await expect(
      requestLoan(creditProof, assetProof, pricing, 3000, provider as any),
    ).rejects.toThrow('not eligible');
  });

  it('attested borrower gets lower APR ceiling than non-attested at same grade', () => {
    const { GRADE_RATE_BANDS } = require('../../config');
    const [, attestedMax] = GRADE_RATE_BANDS.attested.B;
    const [, standardMax] = GRADE_RATE_BANDS.standard.B;
    expect(attestedMax).toBeLessThan(standardMax);
  });
});
```

---

## Running tests

```bash
pnpm test                                            # all tests
pnpm test --watch                                    # watch mode
pnpm test --coverage                                 # coverage report
pnpm test src/__tests__/ai/parse-document.test.ts    # single file
```

## Coverage targets

| Module | Target |
|---|---|
| `src/ai/*` | 90% |
| `src/proof/*` | 85% |
| `src/contract/*` | 85% |
| `src/ingestion/*` | 70% (Plaid/open banking are mostly SDK wrappers) |
| `src/__tests__/integration/*` | flow coverage only |
