/**
 * Server-side Midnight provider singleton.
 * Node.js only — never import in client components.
 *
 * Uses the genesis wallet for server-side circuit calls during the local demo.
 * In production each user would supply their own key via the Lace DApp connector.
 */

import * as path from 'node:path';
import * as fs from 'node:fs';
import { Buffer } from 'buffer';
import { WebSocket } from 'ws';
import * as Rx from 'rxjs';

import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import * as ledger from '@midnight-ntwrk/ledger-v8';
// @ts-ignore — WalletFacade static methods are marked private in .d.ts but are public in JS
import { WalletFacade } from '@midnight-ntwrk/wallet-sdk-facade';
import { DustWallet } from '@midnight-ntwrk/wallet-sdk-dust-wallet';
import { HDWallet, Roles } from '@midnight-ntwrk/wallet-sdk-hd';
import { ShieldedWallet } from '@midnight-ntwrk/wallet-sdk-shielded';
import {
  createKeystore,
  InMemoryTransactionHistoryStorage,
  PublicKey,
  UnshieldedWallet,
} from '@midnight-ntwrk/wallet-sdk-unshielded-wallet';

import { MIDNIGHT_CONFIG } from '../config';

// @ts-ignore — Required for wallet sync in Node.js
globalThis.WebSocket = WebSocket;

const GENESIS_SEED = '0000000000000000000000000000000000000000000000000000000000000001';

export function managedPath(contractName: string): string {
  const fromApp  = path.join(process.cwd(), '..', '..', 'packages', 'contract', 'managed', contractName);
  const fromRoot = path.join(process.cwd(), 'packages', 'contract', 'managed', contractName);
  const candidate = fs.existsSync(path.join(fromApp, 'contract', 'index.js')) ? fromApp : fromRoot;
  if (!fs.existsSync(path.join(candidate, 'contract', 'index.js'))) {
    throw new Error(`Compiled artifact not found for ${contractName}. Run: pnpm --filter contract build`);
  }
  return candidate;
}

function deriveKeys(hexSeed: string) {
  const hdWallet = HDWallet.fromSeed(Buffer.from(hexSeed, 'hex'));
  if (hdWallet.type !== 'seedOk') throw new Error('Invalid seed');
  const result = hdWallet.hdWallet
    .selectAccount(0)
    .selectRoles([Roles.Zswap, Roles.NightExternal, Roles.Dust])
    .deriveKeysAt(0);
  if (result.type !== 'keysDerived') throw new Error('Key derivation failed');
  hdWallet.hdWallet.clear();
  return result.keys;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFn = (...args: any[]) => any;

export interface MidnightProviders {
  walletProvider: Record<string, AnyFn>;
  publicDataProvider: ReturnType<typeof indexerPublicDataProvider>;
  zkConfigProvider: (contractPath: string) => NodeZkConfigProvider<string>;
  proofProvider: (contractPath: string) => ReturnType<typeof httpClientProofProvider>;
  privateStateProvider: (storeName: string) => ReturnType<typeof levelPrivateStateProvider>;
  secretKeyBytes: Uint8Array;
}

let _providers: MidnightProviders | null = null;

export async function getMidnightProviders(): Promise<MidnightProviders> {
  if (_providers) return _providers;

  setNetworkId(MIDNIGHT_CONFIG.networkId);

  const hexSeed = GENESIS_SEED;
  const keys    = deriveKeys(hexSeed);
  const networkId = MIDNIGHT_CONFIG.networkId;

  const shieldedSecretKeys = ledger.ZswapSecretKeys.fromSeed(keys[Roles.Zswap]);
  const dustSecretKey      = ledger.DustSecretKey.fromSeed(keys[Roles.Dust]);
  const unshieldedKeystore = createKeystore(keys[Roles.NightExternal], networkId);

  const walletConfig = {
    networkId,
    indexerClientConnection: {
      indexerHttpUrl: MIDNIGHT_CONFIG.indexerUrl,
      indexerWsUrl:   MIDNIGHT_CONFIG.indexerWsUrl,
    },
    provingServerUrl: new URL(MIDNIGHT_CONFIG.proofServerUrl),
    relayURL:         new URL(MIDNIGHT_CONFIG.nodeUrl),
  };

  const shieldedWallet = ShieldedWallet(walletConfig).startWithSecretKeys(shieldedSecretKeys);
  const unshieldedWallet = UnshieldedWallet({
    networkId,
    indexerClientConnection: walletConfig.indexerClientConnection,
    txHistoryStorage: new InMemoryTransactionHistoryStorage(),
  }).startWithPublicKey(PublicKey.fromKeyStore(unshieldedKeystore));
  const dustWallet = DustWallet({
    ...walletConfig,
    costParameters: { additionalFeeOverhead: 300_000_000_000_000n, feeBlocksMargin: 5 },
  }).startWithSecretKey(dustSecretKey, ledger.LedgerParameters.initialParameters().dust);

  // @ts-ignore — static methods are private in .d.ts but public at runtime
  const submissionService          = WalletFacade.makeDefaultSubmissionService(walletConfig);
  // @ts-ignore
  const pendingTransactionsService = await WalletFacade.makeDefaultPendingTransactionsService(walletConfig);
  // @ts-ignore
  const provingService             = WalletFacade.makeDefaultProvingService(walletConfig);

  // @ts-ignore — 6-arg constructor is private in .d.ts but public at runtime
  const wallet = new WalletFacade(
    shieldedWallet, unshieldedWallet, dustWallet,
    submissionService, pendingTransactionsService, provingService,
  );
  await wallet.start(shieldedSecretKeys, dustSecretKey);

  await Rx.firstValueFrom(wallet.state().pipe(Rx.filter((s: { isSynced: boolean }) => s.isSynced)));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const state: any = await Rx.firstValueFrom(wallet.state().pipe(Rx.filter((s: { isSynced: boolean }) => s.isSynced)));

  const walletProvider = {
    getCoinPublicKey:       () => (state.shielded as { coinPublicKey: { toHexString: () => string } }).coinPublicKey.toHexString(),
    getEncryptionPublicKey: () => (state.shielded as { encryptionPublicKey: { toHexString: () => string } }).encryptionPublicKey.toHexString(),

    async balanceTx(tx: unknown, ttl?: Date) {
      const recipe = await wallet.balanceUnboundTransaction(
        tx as Parameters<typeof wallet.balanceUnboundTransaction>[0],
        { shieldedSecretKeys, dustSecretKey },
        { ttl: ttl ?? new Date(Date.now() + 30 * 60 * 1000) },
      );
      const signFn = (payload: Uint8Array) => unshieldedKeystore.signData(payload);
      // sign base tx
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const base = (recipe as any).baseTransaction;
      if (base?.intents?.size > 0) {
        for (const segment of base.intents.keys()) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const intent = base.intents.get(segment) as any;
          const cloned = ledger.Intent.deserialize<ledger.SignatureEnabled, ledger.Proofish, ledger.PreBinding>(
            'signature', 'proof', 'pre-binding', intent.serialize(),
          );
          const sig = signFn(cloned.signatureData(segment));
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          if (cloned.fallibleUnshieldedOffer) cloned.fallibleUnshieldedOffer = (cloned.fallibleUnshieldedOffer as any).addSignatures([sig]);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          if (cloned.guaranteedUnshieldedOffer) cloned.guaranteedUnshieldedOffer = (cloned.guaranteedUnshieldedOffer as any).addSignatures([sig]);
          base.intents.set(segment, cloned);
        }
      }
      return wallet.finalizeRecipe(recipe);
    },

    submitTx: (tx: unknown) => wallet.submitTransaction(tx as Parameters<typeof wallet.submitTransaction>[0]) as Promise<string>,
  };

  _providers = {
    walletProvider,
    publicDataProvider: indexerPublicDataProvider(MIDNIGHT_CONFIG.indexerUrl, MIDNIGHT_CONFIG.indexerWsUrl),
    zkConfigProvider:   (contractPath: string) => new NodeZkConfigProvider<string>(contractPath),
    proofProvider:      (contractPath: string) => {
      const zk = new NodeZkConfigProvider<string>(contractPath);
      return httpClientProofProvider(MIDNIGHT_CONFIG.proofServerUrl, zk);
    },
    privateStateProvider: (storeName: string) => levelPrivateStateProvider({
      // On serverless (Netlify/Lambda) /tmp is the only writable dir
      midnightDbName: process.env.NETLIFY ? `/tmp/midvault-${storeName}` : undefined,
      privateStateStoreName: storeName,
      accountId: hexSeed,
      privateStoragePasswordProvider: () => 'MidVault-Local-Dev!#2025',
    }),
    secretKeyBytes: Buffer.from(hexSeed, 'hex'),
  };

  return _providers;
}
