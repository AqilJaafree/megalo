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
  try {
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
  } catch (err) {
    throw new Error(`summariseApplicant failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}
