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
  try {
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
  } catch (err) {
    throw new Error(`parseDocument failed: ${err instanceof Error ? err.message : String(err)}`);
  }
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
