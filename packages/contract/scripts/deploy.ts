/**
 * Midvault — deploy all 4 contracts to the local Midnight network
 * Based on the official Midnight deploy guide:
 * https://docs.midnight.network/guides/deploy-mn-app
 *
 * Setup:
 *   1. docker compose up -d   (from repo root)
 *   2. pnpm --filter contract build
 *   3. pnpm --filter contract run deploy
 */

import * as path from 'node:path';
import * as fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Buffer } from 'buffer';
import { WebSocket } from 'ws';
import * as Rx from 'rxjs';

import { CompiledContract } from '@midnight-ntwrk/compact-js';
import { deployContract } from '@midnight-ntwrk/midnight-js-contracts';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
import { setNetworkId, getNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import * as ledger from '@midnight-ntwrk/ledger-v8';
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

// @ts-expect-error Required for wallet sync in Node.js
globalThis.WebSocket = WebSocket;

// ─── Network config (local undeployed) ───────────────────────────────────────

setNetworkId('undeployed');

const CONFIG = {
  indexer:     'http://127.0.0.1:8088/api/v4/graphql',
  indexerWS:   'ws://127.0.0.1:8088/api/v4/graphql/ws',
  node:        'ws://127.0.0.1:9944',
  proofServer: 'http://127.0.0.1:6300',
};

const GENESIS_SEED = '0000000000000000000000000000000000000000000000000000000000000001';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MANAGED   = path.resolve(__dirname, '..', 'managed');
const ENV_OUT   = path.resolve(__dirname, '..', '..', '..', '.env.local');

// Initial credit weights — must sum to 100
const W = { income: 20n, debt: 20n, payments: 20n, cashflow: 15n, utilisation: 15n, assets: 10n };

// ─── Wallet creation (official tutorial pattern) ──────────────────────────────

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

async function createWallet(hexSeed: string) {
  const keys       = deriveKeys(hexSeed);
  const networkId  = getNetworkId();

  const shieldedSecretKeys  = ledger.ZswapSecretKeys.fromSeed(keys[Roles.Zswap]);
  const dustSecretKey       = ledger.DustSecretKey.fromSeed(keys[Roles.Dust]);
  const unshieldedKeystore  = createKeystore(keys[Roles.NightExternal], networkId);

  const walletConfig = {
    networkId,
    indexerClientConnection: {
      indexerHttpUrl: CONFIG.indexer,
      indexerWsUrl:   CONFIG.indexerWS,
    },
    provingServerUrl: new URL(CONFIG.proofServer),
    relayURL:         new URL(CONFIG.node),
  };

  const shieldedWallet = ShieldedWallet(walletConfig)
    .startWithSecretKeys(shieldedSecretKeys);

  const unshieldedWallet = UnshieldedWallet({
    networkId,
    indexerClientConnection: walletConfig.indexerClientConnection,
    txHistoryStorage: new InMemoryTransactionHistoryStorage(),
  }).startWithPublicKey(PublicKey.fromKeyStore(unshieldedKeystore));

  const dustWallet = DustWallet({
    ...walletConfig,
    costParameters: {
      additionalFeeOverhead: 300_000_000_000_000n,
      feeBlocksMargin: 5,
    },
  }).startWithSecretKey(dustSecretKey, ledger.LedgerParameters.initialParameters().dust);

  const submissionService         = WalletFacade.makeDefaultSubmissionService(walletConfig);
  const pendingTransactionsService = await WalletFacade.makeDefaultPendingTransactionsService(walletConfig);
  const provingService            = WalletFacade.makeDefaultProvingService(walletConfig);

  const wallet = new WalletFacade(
    shieldedWallet,
    unshieldedWallet,
    dustWallet,
    submissionService,
    pendingTransactionsService,
    provingService,
  );
  await wallet.start(shieldedSecretKeys, dustSecretKey);

  return { wallet, shieldedSecretKeys, dustSecretKey, unshieldedKeystore };
}

// ─── Sign unshielded transaction intents (official tutorial pattern) ──────────

function signTransactionIntents(
  tx: { intents?: Map<number, unknown> },
  signFn: (payload: Uint8Array) => ledger.Signature,
  proofMarker: 'proof' | 'pre-proof',
): void {
  if (!tx.intents || tx.intents.size === 0) return;

  for (const segment of tx.intents.keys()) {
    const intent = tx.intents.get(segment) as { serialize: () => Uint8Array; fallibleUnshieldedOffer?: { inputs: unknown[]; signatures: unknown[]; addSignatures: (s: unknown[]) => unknown }; guaranteedUnshieldedOffer?: { inputs: unknown[]; signatures: unknown[]; addSignatures: (s: unknown[]) => unknown } };
    if (!intent) continue;

    const cloned = ledger.Intent.deserialize<
      ledger.SignatureEnabled,
      ledger.Proofish,
      ledger.PreBinding
    >('signature', proofMarker, 'pre-binding', intent.serialize());

    const sigData  = cloned.signatureData(segment);
    const signature = signFn(sigData);

    if (cloned.fallibleUnshieldedOffer) {
      const sigs = cloned.fallibleUnshieldedOffer.inputs.map(
        (_: unknown, i: number) => (cloned.fallibleUnshieldedOffer!.signatures as unknown[])[i] ?? signature,
      );
      cloned.fallibleUnshieldedOffer = cloned.fallibleUnshieldedOffer.addSignatures(sigs) as typeof cloned.fallibleUnshieldedOffer;
    }

    if (cloned.guaranteedUnshieldedOffer) {
      const sigs = cloned.guaranteedUnshieldedOffer.inputs.map(
        (_: unknown, i: number) => (cloned.guaranteedUnshieldedOffer!.signatures as unknown[])[i] ?? signature,
      );
      cloned.guaranteedUnshieldedOffer = cloned.guaranteedUnshieldedOffer.addSignatures(sigs) as typeof cloned.guaranteedUnshieldedOffer;
    }

    tx.intents.set(segment, cloned);
  }
}

// ─── Build providers (official tutorial pattern) ──────────────────────────────

async function createProviders(
  walletCtx: Awaited<ReturnType<typeof createWallet>>,
  storeName: string,
  zkConfigPath: string,
  hexSeed: string,
) {
  const state = await Rx.firstValueFrom(
    walletCtx.wallet.state().pipe(Rx.filter((s) => s.isSynced)),
  );

  const walletProvider = {
    getCoinPublicKey:       () => (state.shielded as { coinPublicKey: { toHexString: () => string } }).coinPublicKey.toHexString(),
    getEncryptionPublicKey: () => (state.shielded as { encryptionPublicKey: { toHexString: () => string } }).encryptionPublicKey.toHexString(),

    async balanceTx(tx: unknown, ttl?: Date) {
      const recipe = await walletCtx.wallet.balanceUnboundTransaction(
        tx as Parameters<typeof walletCtx.wallet.balanceUnboundTransaction>[0],
        { shieldedSecretKeys: walletCtx.shieldedSecretKeys, dustSecretKey: walletCtx.dustSecretKey },
        { ttl: ttl ?? new Date(Date.now() + 30 * 60 * 1000) },
      );

      const signFn = (payload: Uint8Array) => walletCtx.unshieldedKeystore.signData(payload);
      signTransactionIntents(recipe.baseTransaction as { intents?: Map<number, unknown> }, signFn, 'proof');
      if (recipe.balancingTransaction) {
        signTransactionIntents(recipe.balancingTransaction as { intents?: Map<number, unknown> }, signFn, 'pre-proof');
      }

      return walletCtx.wallet.finalizeRecipe(recipe);
    },

    submitTx: (tx: unknown) => walletCtx.wallet.submitTransaction(tx as Parameters<typeof walletCtx.wallet.submitTransaction>[0]) as Promise<string>,
  };

  const zkCfg = new NodeZkConfigProvider(zkConfigPath);

  return {
    privateStateProvider: levelPrivateStateProvider({
      privateStateStoreName: storeName,
      accountId: hexSeed,
      privateStoragePasswordProvider: () => 'MidVault-Local-Dev!#2025',
    }),
    publicDataProvider: indexerPublicDataProvider(CONFIG.indexer, CONFIG.indexerWS),
    zkConfigProvider:   zkCfg,
    proofProvider:      httpClientProofProvider(CONFIG.proofServer, zkCfg),
    walletProvider,
    midnightProvider:   walletProvider,
  };
}

// ─── Deploy one contract ──────────────────────────────────────────────────────

async function deploy(
  name: string,
  walletCtx: Awaited<ReturnType<typeof createWallet>>,
  hexSeed: string,
): Promise<string> {
  console.log(`\nDeploying ${name}...`);

  const contractPath = path.join(MANAGED, name, 'contract', 'index.js');
  if (!fs.existsSync(contractPath)) {
    throw new Error(`Artifact missing: ${contractPath}\nRun: pnpm --filter contract build`);
  }

  const mod       = await import(pathToFileURL(contractPath).href);
  const secretKey = Buffer.from(hexSeed, 'hex');
  const zkConfigPath = path.join(MANAGED, name);

  // Witnesses supplied at deploy time (constructor-only witnesses go here)
  let witnesses: Record<string, (_c: unknown) => [unknown, unknown]>;

  if (name === 'credit_proof') {
    witnesses = {
      local_secret_key:      (_c: unknown) => [_c, secretKey],
      initial_income:        (_c: unknown) => [_c, W.income],
      initial_debt:          (_c: unknown) => [_c, W.debt],
      initial_payments:      (_c: unknown) => [_c, W.payments],
      initial_cashflow:      (_c: unknown) => [_c, W.cashflow],
      initial_utilisation:   (_c: unknown) => [_c, W.utilisation],
      initial_assets:        (_c: unknown) => [_c, W.assets],
      get_income_score:      (_c: unknown) => [_c, 0n],
      get_debt_score:        (_c: unknown) => [_c, 0n],
      get_payments_score:    (_c: unknown) => [_c, 0n],
      get_cashflow_score:    (_c: unknown) => [_c, 0n],
      get_utilisation_score: (_c: unknown) => [_c, 0n],
      get_assets_score:      (_c: unknown) => [_c, 0n],
    };
  } else if (name === 'governance') {
    witnesses = {
      local_secret_key:  (_c: unknown) => [_c, secretKey],
      initial_threshold: (_c: unknown) => [_c, 1n],
    };
  } else if (name === 'lending_pool') {
    witnesses = {
      local_secret_key:  (_c: unknown) => [_c, secretKey],
      current_block:     (_c: unknown) => [_c, 0n],
      initial_threshold: (_c: unknown) => [_c, 1n],
    };
  } else {
    // asset_proof
    witnesses = {
      local_secret_key:        (_c: unknown) => [_c, secretKey],
      get_liquid_assets_usd:   (_c: unknown) => [_c, 0n],
      get_illiquid_assets_usd: (_c: unknown) => [_c, 0n],
      get_loan_amount_usd:     (_c: unknown) => [_c, 0n],
    };
  }

  const compiled = CompiledContract.make(name, mod.Contract).pipe(
    CompiledContract.withWitnesses(witnesses),
    CompiledContract.withCompiledFileAssets(zkConfigPath),
  );

  const providers = await createProviders(walletCtx, `${name}-deploy-state`, zkConfigPath, hexSeed);

  const deployed = await deployContract(
    providers as Parameters<typeof deployContract>[0],
    {
      compiledContract:    compiled,
      privateStateId:      `${name}-state`,
      initialPrivateState: {},
    },
  );

  const address = deployed.deployTxData.public.contractAddress as string;
  console.log(`  ✓ ${name} → ${address}`);
  return address;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const seed = process.env['DEPLOY_SEED'] ?? GENESIS_SEED;
  if (seed.length !== 64) { console.error('DEPLOY_SEED must be 64 hex chars'); process.exit(1); }

  console.log('Midvault — deploying to local Midnight network');
  console.log(`  Indexer:      ${CONFIG.indexer}`);
  console.log(`  Node:         ${CONFIG.node}`);
  console.log(`  Proof server: ${CONFIG.proofServer}`);
  console.log('─────────────────────────────────────────');

  console.log('Building wallet...');
  const walletCtx = await createWallet(seed);

  console.log('Waiting for wallet sync...');
  await Rx.firstValueFrom(
    walletCtx.wallet.state().pipe(Rx.filter((s) => s.isSynced)),
  );
  console.log('Wallet synced.');

  const addresses: Record<string, string> = {};
  for (const name of ['credit_proof', 'asset_proof', 'lending_pool', 'governance']) {
    addresses[name] = await deploy(name, walletCtx, seed);
  }

  await walletCtx.wallet.stop();

  // Write .env.local
  const existing = fs.existsSync(ENV_OUT) ? fs.readFileSync(ENV_OUT, 'utf8') : '';
  const lines = existing.split('\n').filter((l) =>
    !l.startsWith('MIDNIGHT_NETWORK_ID=') &&
    !l.startsWith('MIDNIGHT_RPC_URL=') &&
    !l.startsWith('MIDNIGHT_INDEXER_URL=') &&
    !l.startsWith('MIDNIGHT_PROOF_SERVER_URL=') &&
    !l.startsWith('LENDING_POOL_ADDRESS=') &&
    !l.startsWith('GOVERNANCE_ADDRESS=') &&
    !l.startsWith('# credit_proof') &&
    !l.startsWith('# asset_proof'),
  );
  lines.push(
    'MIDNIGHT_NETWORK_ID=undeployed',
    `MIDNIGHT_RPC_URL=http://127.0.0.1:9944`,
    `MIDNIGHT_INDEXER_URL=${CONFIG.indexer}`,
    `MIDNIGHT_PROOF_SERVER_URL=${CONFIG.proofServer}`,
    `LENDING_POOL_ADDRESS=${addresses['lending_pool']}`,
    `GOVERNANCE_ADDRESS=${addresses['governance']}`,
    `# credit_proof: ${addresses['credit_proof']}`,
    `# asset_proof:  ${addresses['asset_proof']}`,
  );
  fs.writeFileSync(ENV_OUT, lines.join('\n') + '\n', 'utf8');

  console.log('\n─────────────────────────────────────────');
  console.log('All contracts deployed. Addresses written to .env.local');
}

main().catch((err) => { console.error(err); process.exit(1); });
