import { CreditFeatures, AttestationStatus } from '../types';
import { parseDocument } from '../ai/parse-document';

export interface OpenBankingCallbackParams {
  code: string;
  state: string;
}

export interface OpenBankingAttestationBundle {
  features: CreditFeatures;
  attestation: AttestationStatus;
}

// Initiate PSD2 OAuth flow — redirects the browser to the bank's consent screen
export function initiateOpenBankingAuth(redirectUri: string): void {
  const clientId = process.env.NEXT_PUBLIC_OPEN_BANKING_CLIENT_ID;
  if (!clientId) throw new Error('NEXT_PUBLIC_OPEN_BANKING_CLIENT_ID not set');

  const state = crypto.randomUUID();
  sessionStorage.setItem('ob_state', state);

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: 'accounts transactions',
    state,
  });

  const authUrl = `https://auth.openbanking.org.uk/oauth2/authorize?${params.toString()}`;
  window.location.href = authUrl;
}

// Exchange the auth code for an access token — must run server-side
async function exchangeAuthCode(code: string): Promise<string> {
  const res = await fetch('/api/open-banking/exchange-token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });

  if (!res.ok) throw new Error(`Open banking token exchange failed: ${res.statusText}`);

  const { access_token } = (await res.json()) as { access_token: string };
  return access_token;
}

// Fetch normalised account data via server proxy — raw figures stay server-side
async function fetchOpenBankingDocument(accessToken: string): Promise<string> {
  const res = await fetch('/api/open-banking/fetch-data', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ access_token: accessToken }),
  });

  if (!res.ok) throw new Error(`Open banking data fetch failed: ${res.statusText}`);

  const { document_base64 } = (await res.json()) as { document_base64: string };
  return document_base64;
}

// Handle the OAuth callback and return attested features
// attested=true because data comes from bank-signed OAuth response
export async function processOpenBankingCallback(
  params: OpenBankingCallbackParams,
  expectedState: string,
): Promise<OpenBankingAttestationBundle> {
  if (params.state !== expectedState) throw new Error('OAuth state mismatch — possible CSRF');

  const accessToken = await exchangeAuthCode(params.code);
  const docBase64 = await fetchOpenBankingDocument(accessToken);

  const features = await parseDocument(docBase64, 'application/pdf', 'open_banking');

  const attestation: AttestationStatus = {
    attested: true,
    provider: 'open_banking',
    attestedAt: new Date(),
  };

  return { features, attestation };
}
