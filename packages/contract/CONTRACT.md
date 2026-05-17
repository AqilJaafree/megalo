# Midvault — Compact Contract Specification

> **Claude Code instructions:** Implement these contracts in Midnight's Compact language.
> One file per contract. Place all contracts under `contracts/` in the project root.
> Do not use any placeholder logic — implement all functions fully.
> All shielded values use `SecretKey` or `Witness` types as appropriate.

---

## Project structure

```
contracts/
  credit_proof.compact       # Borrower credit scoring circuit
  asset_proof.compact        # Asset sufficiency circuit (replaces collateral_proof)
  lending_pool.compact       # Lender pool and loan lifecycle
  governance.compact         # Circuit weight updates via multisig
```

---

## 1. `credit_proof.compact`

### Purpose

Takes private financial features extracted by Claude from TradFi documents (pay stubs, W-2s, tax returns, open banking data, brokerage statements, credit bureau PDFs), runs weighted scoring, and outputs a credit grade. No raw figures are published — only the grade, eligibility boolean, and a commitment hash.

The circuit is document-source-agnostic. Claude normalises all source formats into the same 6-score witness before this circuit runs.

### Private inputs (witness — never leave device or TEE)

```
avg_monthly_income_score   : Uint64   // 0–100, normalised by Claude from pay stub / tax return / P&L
debt_ratio_score           : Uint64   // 0–100, lower is better; from credit bureau or open banking
payment_history_score      : Uint64   // 0–100; from credit bureau pull or bank statement
cashflow_volatility_score  : Uint64   // 0–100, lower is better; from open banking cashflow
credit_utilisation_score   : Uint64   // 0–100, lower is better; replaces EPF — from bureau utilisation
asset_sufficiency_score    : Uint64   // 0–100, optional; from brokerage / pension statement; 50 if absent
```

> `epf_contribution_score` is replaced by `credit_utilisation_score` for TradFi borrowers.
> `asset_sufficiency_score` replaces `wallet_activity_score`. It is a weighted input (not a bonus) because
> TradFi borrowers commonly have verifiable assets that materially affect creditworthiness.

### Public outputs (published on-chain)

```
grade          : Uint8    // 1=A, 2=B, 3=C, 0=rejected
is_eligible    : Boolean
score_hash     : Bytes32  // Poseidon commitment to private inputs — enables audit without exposure
attested       : Boolean  // true if inputs were bank-signed via open banking OAuth / TEE
```

### Scoring weights (updatable via governance)

```
WEIGHT_INCOME      : Uint8 = 30
WEIGHT_DEBT        : Uint8 = 20
WEIGHT_PAYMENTS    : Uint8 = 25
WEIGHT_CASHFLOW    : Uint8 = 10
WEIGHT_UTILISATION : Uint8 = 10
WEIGHT_ASSETS      : Uint8 = 5
```

Weights must always sum to 100. Enforced by `governance.compact`.

### Grade thresholds

```
score >= 80  → grade A (is_eligible = true)
score >= 60  → grade B (is_eligible = true)
score >= 40  → grade C (is_eligible = true)
score < 40   → grade 0 (is_eligible = false)
```

### Circuit logic

```compact
circuit credit_proof(
  avg_monthly_income_score  : Witness<Uint64>,
  debt_ratio_score          : Witness<Uint64>,
  payment_history_score     : Witness<Uint64>,
  cashflow_volatility_score : Witness<Uint64>,
  credit_utilisation_score  : Witness<Uint64>,
  asset_sufficiency_score   : Witness<Uint64>,
  weights                   : PublicInput<CreditWeights>,
  attested                  : PublicInput<Boolean>
) : (grade: Uint8, is_eligible: Boolean, score_hash: Bytes32, attested: Boolean) {

  // Weighted sum — all six inputs are first-class weighted inputs
  let weighted =
    (avg_monthly_income_score  * weights.income)      +
    (debt_ratio_score          * weights.debt)        +
    (payment_history_score     * weights.payments)    +
    (cashflow_volatility_score * weights.cashflow)    +
    (credit_utilisation_score  * weights.utilisation) +
    (asset_sufficiency_score   * weights.assets);

  let total_score = weighted / 100;

  // Grade assignment
  let grade =
    if total_score >= 80 then 1u8
    else if total_score >= 60 then 2u8
    else if total_score >= 40 then 3u8
    else 0u8;

  let is_eligible = grade != 0u8;

  // Poseidon commitment — binds proof to exact inputs, enables later audit
  let score_hash = poseidon([
    avg_monthly_income_score,
    debt_ratio_score,
    payment_history_score,
    cashflow_volatility_score,
    credit_utilisation_score,
    asset_sufficiency_score
  ]);

  return (grade, is_eligible, score_hash, attested);
}
```

---

## 2. `asset_proof.compact`

### Purpose

Proves a TradFi borrower holds sufficient assets relative to the requested loan amount, without revealing brokerage balances, pension values, or property valuations. Accepts inputs from brokerage PDFs, pension statements, or property valuations normalised by Claude.

### Private inputs

```
total_liquid_assets_usd  : Witness<Uint64>   // Claude-calculated from brokerage / pension statement
total_illiquid_assets_usd: Witness<Uint64>   // Property valuation or pension — illiquid, lower weight
loan_amount_usd          : Witness<Uint64>   // Requested amount
min_liquid_ratio         : PublicInput<Uint8> // Min liquid assets / loan (e.g. 100 = 100%)
```

### Public outputs

```
asset_sufficient : Boolean
asset_tier       : Uint8    // 1=standard, 2=mid, 3=high — coarse bracket, not exact value
```

### Circuit logic

```compact
circuit asset_proof(
  total_liquid_assets_usd  : Witness<Uint64>,
  total_illiquid_assets_usd: Witness<Uint64>,
  loan_amount_usd          : Witness<Uint64>,
  min_liquid_ratio         : PublicInput<Uint8>
) : (asset_sufficient: Boolean, asset_tier: Uint8) {

  // Liquid assets must meet ratio independently — illiquid assets are informational only
  let liquid_ratio = (total_liquid_assets_usd * 100) / loan_amount_usd;
  let asset_sufficient = liquid_ratio >= (min_liquid_ratio as Uint64);

  // Coarse bracket — reveals no specific figure
  let combined = total_liquid_assets_usd + (total_illiquid_assets_usd / 2);
  let asset_tier =
    if combined >= 250000 then 3u8
    else if combined >= 50000 then 2u8
    else 1u8;

  return (asset_sufficient, asset_tier);
}
```

---

## 3. `lending_pool.compact`

### Purpose

Manages the full loan lifecycle: pool deposits, loan issuance using the credit proof, repayments, and defaults. Enforces Claude's rate recommendation on-chain. The `attested` flag from the credit proof is stored on the loan — attested loans may receive preferential rate bands.

Claude cannot directly call any function — all parameters are passed by the borrower or lender at transaction time.

### State

```compact
ledger {
  // Pool
  total_liquidity     : Uint64,
  utilisation         : Uint64,   // basis points, 0–10000

  // Per-loan (keyed by loan_id : Bytes32)
  loans               : Map<Bytes32, Loan>,

  // Circuit weights (updatable by governance only)
  credit_weights      : CreditWeights,

  // Governance
  multisig_threshold  : Uint8,
  governors           : Set<PublicKey>
}
```

### Types

```compact
struct Loan {
  borrower_grade    : Uint8,
  principal         : Uint64,
  apr_bps           : Uint16,    // APR in basis points, e.g. 840 = 8.4%
  term_months       : Uint8,
  disbursed_at      : Uint64,    // block timestamp
  repaid            : Boolean,
  defaulted         : Boolean,
  score_hash        : Bytes32,   // links loan to the credit proof commitment
  attested          : Boolean    // true = bank-signed inputs via open banking / TEE
}

struct CreditWeights {
  income      : Uint8,
  debt        : Uint8,
  payments    : Uint8,
  cashflow    : Uint8,
  utilisation : Uint8,
  assets      : Uint8
}
```

### Functions

#### `deposit_liquidity`
Lender deposits capital into the pool.
```compact
export circuit deposit_liquidity(amount: Uint64) {
  assert amount > 0u64;
  ledger.total_liquidity += amount;
}
```

#### `request_loan`
Borrower submits credit proof outputs and requests a loan. Rate (`apr_bps`) is set by Claude off-chain and passed as a parameter. The contract validates the rate falls within the allowed band for the grade. Attested loans receive a tighter (more favourable) upper band.

```compact
export circuit request_loan(
  grade       : Uint8,
  is_eligible : Boolean,
  score_hash  : Bytes32,
  attested    : Boolean,
  principal   : Uint64,
  apr_bps     : Uint16,
  term_months : Uint8
) : Bytes32 {

  assert is_eligible;
  assert principal <= ledger.total_liquidity;
  assert term_months >= 1u8 && term_months <= 60u8;   // up to 5 years for TradFi

  // Validate rate band — attested loans get tighter (lower) ceiling
  let (min_apr, max_apr) = grade_rate_band(grade, attested);
  assert apr_bps >= min_apr && apr_bps <= max_apr;

  let loan_id = poseidon([score_hash, principal, current_block()]);

  ledger.loans.insert(loan_id, Loan {
    borrower_grade: grade,
    principal,
    apr_bps,
    term_months,
    disbursed_at: current_block(),
    repaid: false,
    defaulted: false,
    score_hash,
    attested
  });

  ledger.total_liquidity -= principal;
  ledger.utilisation = compute_utilisation();

  return loan_id;
}
```

#### `repay_loan`
```compact
export circuit repay_loan(loan_id: Bytes32, amount: Uint64) {
  let loan = ledger.loans.get(loan_id);
  assert !loan.repaid && !loan.defaulted;
  assert amount >= expected_repayment(loan);

  ledger.loans.update(loan_id, { repaid: true });
  ledger.total_liquidity += amount;
  ledger.utilisation = compute_utilisation();
}
```

#### `mark_default`
Called by a governor after the grace period expires.
```compact
export circuit mark_default(loan_id: Bytes32, caller: PublicKey) {
  assert ledger.governors.contains(caller);
  let loan = ledger.loans.get(loan_id);
  assert !loan.repaid && !loan.defaulted;
  assert is_past_due(loan);

  ledger.loans.update(loan_id, { defaulted: true });
}
```

#### `grade_rate_band` (internal helper)
Attested loans get a lower ceiling — reflecting the higher trust of bank-signed inputs.

```compact
function grade_rate_band(grade: Uint8, attested: Boolean) : (Uint16, Uint16) {
  // (min_apr_bps, max_apr_bps)
  if attested {
    if grade == 1u8 then return (350u16, 650u16)     // A attested: 3.5–6.5%
    else if grade == 2u8 then return (650u16, 950u16) // B attested: 6.5–9.5%
    else return (950u16, 1300u16)                     // C attested: 9.5–13%
  } else {
    if grade == 1u8 then return (500u16, 800u16)      // A standard: 5–8%
    else if grade == 2u8 then return (800u16, 1100u16) // B standard: 8–11%
    else return (1100u16, 1500u16)                    // C standard: 11–15%
  }
}
```

---

## 4. `governance.compact`

### Purpose

Allows the governor multisig to update credit circuit weights. Claude proposes new weights off-chain based on cohort analysis; governors sign; contract applies once the threshold is met.

### Functions

#### `propose_weight_update`
```compact
export circuit propose_weight_update(
  new_weights   : CreditWeights,
  rationale_hash: Bytes32,
  proposer      : PublicKey
) : Bytes32 {

  assert ledger.governors.contains(proposer);
  assert weights_sum_to_100(new_weights);

  let proposal_id = poseidon([new_weights, current_block()]);
  ledger.proposals.insert(proposal_id, {
    new_weights,
    rationale_hash,
    approvals: Set::new(),
    executed: false
  });

  return proposal_id;
}
```

#### `approve_proposal`
```compact
export circuit approve_proposal(proposal_id: Bytes32, governor: PublicKey) {
  assert ledger.governors.contains(governor);
  let proposal = ledger.proposals.get(proposal_id);
  assert !proposal.executed;

  proposal.approvals.insert(governor);

  if proposal.approvals.len() >= ledger.multisig_threshold {
    ledger.credit_weights = proposal.new_weights;
    ledger.proposals.update(proposal_id, { executed: true });
  }
}
```

---

## Changes from Malaysian retail to TradFi

| Item | Before | After |
|---|---|---|
| 5th witness input | `epf_contribution_score` | `credit_utilisation_score` |
| 6th witness input | `wallet_activity_score` (bonus only) | `asset_sufficiency_score` (weighted input) |
| `collateral_proof` | Wallet snapshot → LTV | `asset_proof` — liquid + illiquid assets |
| `attested` flag | Not present | Added to proof output and Loan struct |
| Rate bands | One set | Two sets — attested vs standard |
| Max term | 36 months | 60 months |
| Weight on assets | 0 (bonus) | 5 (weighted) |
| Weight redistribution | Cashflow 10, EPF 10 | Cashflow 10, utilisation 10, assets 5 (debt reduced from 25 → 20) |

---

## Constraints for Claude Code

- All `Witness<T>` values must never appear in any public output or log
- `poseidon` is the only permitted hash function for commitments
- `current_block()` is the Midnight built-in for block timestamp
- Do not add any admin backdoor or owner escape hatch
- All arithmetic must use checked math — no silent overflow
- `grade_rate_band` must be called inside `request_loan` before disbursement; never skip it
- `weights_sum_to_100` must validate all six weight fields sum to exactly 100
- The `attested` public input must come from the proof server, never from user-supplied calldata
