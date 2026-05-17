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

  try {
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
  } catch (err) {
    throw new Error(`priceLoan failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}
