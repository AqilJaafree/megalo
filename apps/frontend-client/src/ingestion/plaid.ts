import { CreditFeatures, AttestationStatus } from '../types';
import { parseDocument } from '../ai/parse-document';

export interface PlaidLinkResult {
  publicToken: string;
  institutionId: string;
  institutionName: string;
}

export interface PlaidAttestationBundle {
  features: CreditFeatures;
  attestation: AttestationStatus;
}

// Exchange the public token for an access token — must run server-side
export async function exchangePublicToken(publicToken: string): Promise<string> {
  const res = await fetch('/api/plaid/exchange-token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ public_token: publicToken }),
  });

  if (!res.ok) throw new Error(`Plaid token exchange failed: ${res.statusText}`);

  const { access_token } = (await res.json()) as { access_token: string };
  return access_token;
}

// Fetch a normalised account summary from the Plaid API via the server proxy
// The server returns a base64-encoded JSON document — raw numbers stay server-side
async function fetchPlaidDocument(accessToken: string): Promise<string> {
  const res = await fetch('/api/plaid/fetch-data', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ access_token: accessToken }),
  });

  if (!res.ok) throw new Error(`Plaid data fetch failed: ${res.statusText}`);

  const { document_base64 } = (await res.json()) as { document_base64: string };
  return document_base64;
}

// Full Plaid flow: token exchange → data fetch → feature extraction
// attested=true because data comes from bank-signed OAuth response
export async function processPlaidLink(result: PlaidLinkResult): Promise<PlaidAttestationBundle> {
  const accessToken = await exchangePublicToken(result.publicToken);
  const docBase64 = await fetchPlaidDocument(accessToken);

  const features = await parseDocument(docBase64, 'application/pdf', 'plaid');

  const attestation: AttestationStatus = {
    attested: true,
    provider: 'plaid',
    attestedAt: new Date(),
  };

  return { features, attestation };
}
