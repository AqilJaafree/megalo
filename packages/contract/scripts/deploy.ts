/**
 * Midvault — deploy all 4 contracts to the local Midnight network
 *
 * Setup (one-time):
 *   1. Start Docker:       sudo systemctl start docker
 *   2. Start local stack:  docker compose up -d   (from repo root)
 *   3. Wait for healthy:   docker compose ps  (indexer must be healthy)
 *
 * Run:
 *   pnpm --filter contract deploy
 *
 * Writes contract addresses to .env.local in the repo root.
 *
 * The genesis wallet seed is pre-funded with tNIGHT on the local network.
 * Optionally override via DEPLOY_SEED env var (must be 64-char hex).
 */

import * as path from 'node:path';
import * as fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { WebSocket } from 'ws';
import * as Rx from 'rxjs';

import { CompiledContract } from '@midnight-ntwrk/compact-js';
import { deployContract } from '@midnight-ntwrk/midnight-js-contracts';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import * as ledger from '@midnight-ntwrk/ledger-v8';
import {
  createDefaultTestLogger,
  MidnightWalletProvider,
  type EnvironmentConfiguration,
} from '@midnight-ntwrk/testkit-js';

// @ts-expect-error WebSocket global shim required by wallet sync
globalThis.WebSocket = WebSocket;

// ─── Local network config ────────────────────────────────────────────────────

setNetworkId('undeployed');

const GENESIS_SEED = '0000000000000000000000000000000000000000000000000000000000000001';

const CONFIG: EnvironmentConfiguration = {
  networkId: 'undeployed',
  walletNetworkId: ledger.NetworkId.NetworkId.Undeployed,
  indexer:     'http://127.0.0.1:8088/api/v4/graphql',
  indexerWS:   'ws://127.0.0.1:8088/api/v4/graphql/ws',
  node:        'http://127.0.0.1:9944',
  nodeWS:      'ws://127.0.0.1:9944',
  proofServer: 'http://127.0.0.1:6300',
  faucet:      undefined,
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MANAGED   = path.resolve(__dirname, '..', 'managed');
const ENV_OUT   = path.resolve(__dirname, '..', '..', '..', '.env.local');

const logger = createDefaultTestLogger();

// ─── Load compiled contract artifact ─────────────────────────────────────────

async function loadCompiledContract(name: string) {
  const contractPath = path.join(MANAGED, name, 'contract', 'index.js');
  if (!fs.existsSync(contractPath)) {
    throw new Error(
      `Compiled artifact not found: ${contractPath}\nRun: pnpm --filter contract build`,
    );
  }
  const mod = await import(pathToFileURL(contractPath).href);
  const zkConfigPath = path.join(MANAGED, name);

  return CompiledContract.make(name, mod.Contract).pipe(
    CompiledContract.withVacantWitnesses,
    CompiledContract.withCompiledFileAssets(zkConfigPath),
  );
}

// ─── Build providers ─────────────────────────────────────────────────────────

function buildProviders(walletProvider: MidnightWalletProvider, zkConfigPath: string) {
  const zkCfg = new NodeZkConfigProvider(zkConfigPath);
  return {
    privateStateProvider: levelPrivateStateProvider({
      privateStateStoreName: 'midvault-deploy',
      walletProvider,
    }),
    publicDataProvider: indexerPublicDataProvider(CONFIG.indexer!, CONFIG.indexerWS!),
    zkConfigProvider:   zkCfg,
    proofProvider:      httpClientProofProvider(CONFIG.proofServer!, zkCfg),
    walletProvider,
    midnightProvider:   walletProvider,
  };
}

// ─── Deploy one contract ──────────────────────────────────────────────────────

async function deploy(name: string, walletProvider: MidnightWalletProvider): Promise<string> {
  logger.info(`Deploying ${name}...`);
  const compiled = await loadCompiledContract(name);
  const providers = buildProviders(walletProvider, path.join(MANAGED, name));

  const deployed = await deployContract(providers, {
    compiledContract: compiled,
    privateStateKey: `${name}-state`,
    initialPrivateState: {},
  });

  const address = deployed.deployTxData.public.contractAddress as string;
  logger.info(`  ✓ ${name} → ${address}`);
  return address;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const seed = process.env['DEPLOY_SEED'] ?? GENESIS_SEED;
  if (seed.length !== 64) {
    console.error('Error: DEPLOY_SEED must be a 64-char hex string.');
    process.exit(1);
  }

  console.log('Midvault — deploying to local Midnight network');
  console.log('  Node:         http://127.0.0.1:9944');
  console.log('  Indexer:      http://127.0.0.1:8088');
  console.log('  Proof server: http://127.0.0.1:6300');
  console.log('  Seed:        ', seed === GENESIS_SEED ? '(genesis pre-funded wallet)' : '(custom DEPLOY_SEED)');
  console.log('─────────────────────────────────────────');

  const walletProvider = await MidnightWalletProvider.build(logger, CONFIG, seed);
  await walletProvider.start();

  logger.info('Waiting for wallet sync...');
  await Rx.firstValueFrom(
    walletProvider.wallet.state().pipe(Rx.filter((s) => s.isSynced)),
  );

  const addresses: Record<string, string> = {};
  for (const name of ['credit_proof', 'asset_proof', 'lending_pool', 'governance']) {
    addresses[name] = await deploy(name, walletProvider);
  }

  // Write addresses to .env.local
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
    'MIDNIGHT_RPC_URL=http://127.0.0.1:9944',
    'MIDNIGHT_INDEXER_URL=http://127.0.0.1:8088/api/v4/graphql',
    'MIDNIGHT_PROOF_SERVER_URL=http://127.0.0.1:6300',
    `LENDING_POOL_ADDRESS=${addresses['lending_pool']}`,
    `GOVERNANCE_ADDRESS=${addresses['governance']}`,
    `# credit_proof: ${addresses['credit_proof']}`,
    `# asset_proof:  ${addresses['asset_proof']}`,
  );

  fs.writeFileSync(ENV_OUT, lines.join('\n') + '\n', 'utf8');

  console.log('\n─────────────────────────────────────────');
  console.log('All contracts deployed. Addresses written to .env.local');
  console.log('\nNow run: pnpm --filter contract test-local');

  await walletProvider.stop();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
