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
  try {
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
  } catch (err) {
    throw new Error(`analyseCohort failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}
