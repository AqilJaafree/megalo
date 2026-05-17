'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

// ── DApp Connector API types (v4.x) ──────────────────────────────────────────
// https://docs.midnight.network/api-reference/dapp-connector

interface ServiceUriConfig {
  indexerUri: string;
  indexerWsUri: string;
  proverServerUri: string;
  substrateNodeUri: string;
  networkId: string;
}

interface ConnectedAPI {
  getConnectionStatus: () => Promise<{ networkId: string }>;
  getConfiguration: () => Promise<ServiceUriConfig>;
  getDustAddress: () => Promise<string>;
  getShieldedAddresses: () => Promise<{ shieldedAddress: string }>;
  getUnshieldedAddress: () => Promise<string>;
  balanceUnsealedTransaction: (tx: unknown) => Promise<{ tx: unknown }>;
  balanceSealedTransaction: (tx: unknown) => Promise<unknown>;
  submitTransaction: (tx: unknown) => Promise<string>;
}

interface InitialAPI {
  name: string;
  icon: string;
  apiVersion: string;
  connect: (networkId: string) => Promise<ConnectedAPI>;
}

declare global {
  interface Window {
    midnight?: Record<string, InitialAPI>;
  }
}

// Use NEXT_PUBLIC_ prefix so this is available in the browser bundle
const NETWORK_ID =
  process.env.NEXT_PUBLIC_MIDNIGHT_NETWORK_ID ?? 'undeployed';

export type LaceConnectionState =
  | { status: 'disconnected' }
  | { status: 'connecting' }
  | { status: 'connected'; address: string }
  | { status: 'not_installed' }
  | { status: 'error'; message: string };

function findLace(): InitialAPI | undefined {
  const mn = window.midnight;
  if (!mn) return undefined;
  // Prefer mnLace, fall back to any available wallet
  return mn['mnLace'] ?? Object.values(mn)[0];
}

export function useLaceWallet() {
  const [connection, setConnection] = useState<LaceConnectionState>({ status: 'disconnected' });
  const [api, setApi] = useState<ConnectedAPI | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Poll for the extension for up to 5 seconds after mount
  useEffect(() => {
    let attempts = 0;
    const MAX = 25; // 25 × 200 ms = 5 s

    pollRef.current = setInterval(() => {
      attempts++;
      if (findLace()) {
        clearInterval(pollRef.current!);
        // Found — reset not_installed if it was set, stay disconnected otherwise
        setConnection(prev =>
          prev.status === 'not_installed' ? { status: 'disconnected' } : prev,
        );
        return;
      }
      if (attempts >= MAX) {
        clearInterval(pollRef.current!);
        setConnection({ status: 'not_installed' });
      }
    }, 200);

    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const connect = useCallback(async () => {
    setConnection({ status: 'connecting' });

    // Re-poll briefly in case user just installed the extension
    if (!findLace()) {
      await new Promise<void>(resolve => {
        let n = 0;
        const t = setInterval(() => {
          n++;
          if (findLace() || n >= 15) { clearInterval(t); resolve(); }
        }, 200);
      });
    }

    const lace = findLace();
    if (!lace) {
      setConnection({ status: 'not_installed' });
      return;
    }

    try {
      // v4 API: connect(networkId) → ConnectedAPI
      // Fall back to old v1 API (enable()) for users on older Lace versions
      let connectedApi: ConnectedAPI;
      if (typeof (lace as unknown as Record<string, unknown>)['connect'] === 'function') {
        connectedApi = await lace.connect(NETWORK_ID);
      } else {
        // Old v1 API
        connectedApi = await (lace as unknown as { enable: () => Promise<ConnectedAPI> }).enable();
      }

      // getDustAddress / getUnshieldedAddress may return Bech32m objects — coerce to string
      let address = '';
      try { address = String(await connectedApi.getDustAddress()); } catch { /* ignore */ }
      if (!address || address === 'undefined') {
        try { address = String(await connectedApi.getUnshieldedAddress()); } catch { /* ignore */ }
      }
      if (!address || address === 'undefined') {
        try {
          const s = await connectedApi.getShieldedAddresses();
          address = String(s?.shieldedAddress ?? '');
        } catch { /* ignore */ }
      }

      setApi(connectedApi);
      setConnection({ status: 'connected', address: address || 'connected' });
    } catch (err) {
      setConnection({
        status: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }, []);

  const disconnect = useCallback(() => {
    setApi(null);
    setConnection({ status: 'disconnected' });
  }, []);

  return { connection, api, connect, disconnect };
}
