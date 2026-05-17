// Local pre-verification before on-chain submission
// Sends the proof to the Midnight proof server's verify endpoint rather than running locally

import { MIDNIGHT_CONFIG } from '../config';

export interface ProofBundle {
  proofBytes: Uint8Array;
  publicInputs: Record<string, unknown>;
}

// Verify a proof via the Midnight proof server before submitting on-chain
async function verifyViaProofServer(
  circuit: string,
  bundle: ProofBundle,
): Promise<boolean> {
  const url = `${MIDNIGHT_CONFIG.proofServerUrl}/verify/${circuit}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      proof: Buffer.from(bundle.proofBytes).toString('base64'),
      publicInputs: bundle.publicInputs,
    }),
  });

  if (!res.ok) {
    throw new Error(`Proof server verification failed (${res.status}): ${await res.text()}`);
  }

  const { valid } = (await res.json()) as { valid: boolean };
  return valid;
}

export async function verifyCreditProof(bundle: ProofBundle): Promise<boolean> {
  try {
    return await verifyViaProofServer('prove_credit', bundle);
  } catch (err) {
    throw new Error(`verifyCreditProof failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export async function verifyAssetProof(bundle: ProofBundle): Promise<boolean> {
  try {
    return await verifyViaProofServer('prove_assets', bundle);
  } catch (err) {
    throw new Error(`verifyAssetProof failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}
