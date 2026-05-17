import { NextRequest, NextResponse } from 'next/server';
import { parseDocument } from '@/ai/parse-document';
import { DocumentSource } from '@/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const { base64, source } = await req.json() as { base64: string; source: DocumentSource };
    const features = await parseDocument(base64, 'application/pdf', source);
    return NextResponse.json(features);
  } catch (err) {
    console.error('[parse-document]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
