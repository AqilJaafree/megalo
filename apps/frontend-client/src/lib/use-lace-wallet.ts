'use client';

import { useState, useEffect, useCallback } from 'react';

// Midnight DApp connector injected by Lace wallet extension
// https://docs.midnight.network/develop/tutorial/using/implement-ui/#connect-to-the-wallet
interface MidnightLaceAPI {
  apiVersion: string;
  enable: () => Promise<EnabledAPI>;
  isEnabled: () => Promise<boolean>;
  name: string;
  icon: string;
}

interface EnabledAPI {
  state: () => Promise<WalletState>;
  balanceTransaction: (tx: unknown) => Promise<unknown>;
  submitTransaction: (tx: unknown) => Promise<string>;
}

interface WalletState {
  coinPublicKey?: string;
  encryptionPublicKey?: string;
  address?: string;
}

declare global {
  interface Window {
    midnight?: {
      mnLace?: MidnightLaceAPI;
    };
  }
}

export type LaceConnectionState =
  | { status: 'disconnected' }
  | { status: 'connecting' }
  | { status: 'connected'; address: string; coinPublicKey: string }
  | { status: 'not_installed' }
  | { status: 'error'; message: string };

export function useLaceWallet() {
  const [connection, setConnection] = useState<LaceConnectionState>({ status: 'disconnected' });
  const [api, setApi] = useState<EnabledAPI | null>(null);

  useEffect(() => {
    // Give the extension time to inject
    const timer = setTimeout(() => {
      if (!window.midnight?.mnLace) {
        setConnection({ status: 'not_installed' });
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, []);

  const connect = useCallback(async () => {
    setConnection({ status: 'connecting' });

    if (!window.midnight?.mnLace) {
      setConnection({ status: 'not_installed' });
      return;
    }

    try {
      const enabledApi = await window.midnight.mnLace.enable();
      const state = await enabledApi.state();
      setApi(enabledApi);
      setConnection({
        status: 'connected',
        address: state.address ?? state.coinPublicKey ?? 'unknown',
        coinPublicKey: state.coinPublicKey ?? '',
      });
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
