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
  try {
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
  } catch (err) {
    throw new Error(`explainScore failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}
