import { CreditFeatures, CreditProofOutput, AttestationStatus } from '../types';

export async function generateCreditProof(
  features: CreditFeatures,
  _secretKey: Uint8Array,
  attestation: AttestationStatus,
): Promise<CreditProofOutput> {
  // attested flag must originate from proof server or Plaid OAuth — never from user input.
  const attested = attestation.attested;

  const res = await fetch('/api/contract/prove-credit', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ features, attested }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(`generateCreditProof failed: ${(err as { error: string }).error}`);
  }

  // Raw CreditFeatures must be garbage-collected immediately after this function returns.
  const data = await res.json() as CreditProofOutput;
  return data;
}
