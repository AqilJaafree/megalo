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
