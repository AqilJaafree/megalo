import { NextRequest, NextResponse } from 'next/server';
import { explainScore } from '@/ai/explain-score';
import { CreditGrade } from '@/types';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const { grade, qualitativeHints } = await req.json() as {
      grade: CreditGrade;
      qualitativeHints: {
        incomeStability: 'High' | 'Good' | 'Moderate' | 'Low';
        paymentRecord: 'High' | 'Good' | 'Moderate' | 'Low';
        existingCommitments: 'High' | 'Good' | 'Moderate' | 'Low';
      };
    };
    const result = await explainScore(grade, qualitativeHints);
    return NextResponse.json(result);
  } catch (err) {
    console.error('[explain-score]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
