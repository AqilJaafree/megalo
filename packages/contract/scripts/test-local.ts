/**
 * Midvault — smoke tests against deployed contracts on the local Midnight network
 *
 * Setup:
 *   1. Start local stack:  docker compose up -d   (from repo root)
 *   2. Deploy contracts:   pnpm --filter contract deploy
 *   3. Run tests:          pnpm --filter contract test-local
 *
 * The genesis wallet seed is used by default (same as deploy).
 * Override via DEPLOY_SEED env var if you deployed with a custom seed.
 */

import * as path from 'node:path';
import * as fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { WebSocket } from 'ws';
import * as Rx from 'rxjs';

import { CompiledContract } from '@midnight-ntwrk/compact-js';
import { submitCallTx, findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { assertIsContractAddress } from '@midnight-ntwrk/midnight-js-utils';
import * as ledger from '@midnight-ntwrk/ledger-v8';
import {
  createDefaultTestLogger,
  MidnightWalletProvider,
  type EnvironmentConfiguration,
} from '@midnight-ntwrk/testkit-js';

// @ts-expect-error WebSocket global shim
globalThis.WebSocket = WebSocket;

// ─── Local network config ─────────────────────────────────────────────────────

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
const ENV_FILE  = path.resolve(__dirname, '..', '..', '..', '.env.local');

const log = createDefaultTestLogger();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function readEnv(): Record<string, string> {
  if (!fs.existsSync(ENV_FILE)) throw new Error('.env.local not found — run deploy first');
  return Object.fromEntries(
    fs.readFileSync(ENV_FILE, 'utf8')
      .split('\n')
      .filter((l) => l.includes('=') && !l.startsWith('#'))
      .map((l) => {
        const idx = l.indexOf('=');
        return [l.slice(0, idx), l.slice(idx + 1)] as [string, string];
      }),
  );
}

async function loadCompiled(name: string) {
  const mod = await import(pathToFileURL(path.join(MANAGED, name, 'contract', 'index.js')).href);
  const zkConfigPath = path.join(MANAGED, name);
  return {
    compiled: CompiledContract.make(name, mod.Contract).pipe(
      CompiledContract.withVacantWitnesses,
      CompiledContract.withCompiledFileAssets(zkConfigPath),
    ),
    zkConfigPath,
  };
}

function buildProviders(walletProvider: MidnightWalletProvider, zkConfigPath: string) {
  const zkCfg = new NodeZkConfigProvider(zkConfigPath);
  return {
    privateStateProvider: levelPrivateStateProvider({
      privateStateStoreName: 'midvault-test',
      walletProvider,
    }),
    publicDataProvider: indexerPublicDataProvider(CONFIG.indexer!, CONFIG.indexerWS!),
    zkConfigProvider:   zkCfg,
    proofProvider:      httpClientProofProvider(CONFIG.proofServer!, zkCfg),
    walletProvider,
    midnightProvider:   walletProvider,
  };
}

function parseAddress(env: Record<string, string>, key: string): string {
  const val = env[key];
  if (!val) throw new Error(`${key} not found in .env.local — run deploy first`);
  return val.trim();
}

function extractCommentAddress(envFile: string, prefix: string): string {
  const lines = fs.readFileSync(envFile, 'utf8').split('\n');
  for (const line of lines) {
    if (line.startsWith(prefix)) {
      return line.split(':').slice(1).join(':').trim();
    }
  }
  throw new Error(`Address with prefix "${prefix}" not found in .env.local`);
}

// ─── Test runner ──────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void>) {
  process.stdout.write(`  ${name} ... `);
  try {
    await fn();
    console.log('✓ pass');
    passed++;
  } catch (err) {
    console.log(`✗ FAIL — ${err instanceof Error ? err.message : String(err)}`);
    failed++;
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const seed = process.env['DEPLOY_SEED'] ?? GENESIS_SEED;
  if (seed.length !== 64) {
    console.error('Error: DEPLOY_SEED must be a 64-char hex string.');
    process.exit(1);
  }

  const env = readEnv();
  const lendingPoolAddress = parseAddress(env, 'LENDING_POOL_ADDRESS');
  const governanceAddress  = parseAddress(env, 'GOVERNANCE_ADDRESS');
  const creditProofAddress = extractCommentAddress(ENV_FILE, '# credit_proof');
  const assetProofAddress  = extractCommentAddress(ENV_FILE, '# asset_proof');

  console.log('Midvault — smoke tests on local Midnight network');
  console.log(`  credit_proof:  ${creditProofAddress}`);
  console.log(`  asset_proof:   ${assetProofAddress}`);
  console.log(`  lending_pool:  ${lendingPoolAddress}`);
  console.log(`  governance:    ${governanceAddress}`);
  console.log('──────────────────────────────────────');

  const walletProvider = await MidnightWalletProvider.build(log, CONFIG, seed);
  await walletProvider.start();

  log.info('Waiting for wallet sync...');
  await Rx.firstValueFrom(
    walletProvider.wallet.state().pipe(Rx.filter((s) => s.isSynced)),
  );

  // ── Test 1: credit_proof — contract exists on-chain ───────────────────────
  await test('credit_proof: contract exists on-chain', async () => {
    const { compiled, zkConfigPath } = await loadCompiled('credit_proof');
    const providers = buildProviders(walletProvider, zkConfigPath);
    assertIsContractAddress(creditProofAddress);
    const found = await findDeployedContract(providers, {
      compiledContract: compiled,
      contractAddress: creditProofAddress,
      privateStateKey: 'credit-proof-state',
      initialPrivateState: {},
    });
    if (!found.deployTxData.public.contractAddress) throw new Error('No contract address');
  });

  // ── Test 2: credit_proof — prove_credit ──────────────────────────────────
  await test('credit_proof: prove_credit (grade A, not attested)', async () => {
    const { zkConfigPath } = await loadCompiled('credit_proof');
    const mod = await import(pathToFileURL(path.join(MANAGED, 'credit_proof', 'contract', 'index.js')).href);
    const secretKey = new Uint8Array(32).fill(0x42);

    const contractInstance = new mod.Contract({
      local_secret_key:      (_ctx: unknown) => [_ctx, secretKey] as [unknown, Uint8Array],
      get_income_score:      (_ctx: unknown) => [_ctx, 85n] as [unknown, bigint],
      get_debt_score:        (_ctx: unknown) => [_ctx, 80n] as [unknown, bigint],
      get_payments_score:    (_ctx: unknown) => [_ctx, 82n] as [unknown, bigint],
      get_cashflow_score:    (_ctx: unknown) => [_ctx, 83n] as [unknown, bigint],
      get_utilisation_score: (_ctx: unknown) => [_ctx, 81n] as [unknown, bigint],
      get_assets_score:      (_ctx: unknown) => [_ctx, 84n] as [unknown, bigint],
    });

    const compiled = CompiledContract.make('credit_proof', contractInstance.constructor)
      .pipe(CompiledContract.withCompiledFileAssets(zkConfigPath));

    const providers = buildProviders(walletProvider, zkConfigPath);
    assertIsContractAddress(creditProofAddress);

    const result = await submitCallTx(providers, {
      compiledContract: compiled,
      circuitId: 'prove_credit',
      contractAddress: creditProofAddress,
      privateStateKey: 'credit-proof-state',
      newPrivateState: {},
      args: [false],
    });

    if (!result.public.txId) throw new Error('No txId in result');
  });

  // ── Test 3: asset_proof — prove_assets ────────────────────────────────────
  await test('asset_proof: prove_assets (liquid $100k, illiquid $200k, loan $50k)', async () => {
    const { zkConfigPath } = await loadCompiled('asset_proof');
    const mod = await import(pathToFileURL(path.join(MANAGED, 'asset_proof', 'contract', 'index.js')).href);
    const secretKey = new Uint8Array(32).fill(0x43);

    const contractInstance = new mod.Contract({
      local_secret_key:        (_ctx: unknown) => [_ctx, secretKey] as [unknown, Uint8Array],
      get_liquid_assets_usd:   (_ctx: unknown) => [_ctx, 100_000n] as [unknown, bigint],
      get_illiquid_assets_usd: (_ctx: unknown) => [_ctx, 200_000n] as [unknown, bigint],
      get_loan_amount_usd:     (_ctx: unknown) => [_ctx, 50_000n]  as [unknown, bigint],
    });

    const compiled = CompiledContract.make('asset_proof', contractInstance.constructor)
      .pipe(CompiledContract.withCompiledFileAssets(zkConfigPath));

    const providers = buildProviders(walletProvider, zkConfigPath);
    assertIsContractAddress(assetProofAddress);

    const result = await submitCallTx(providers, {
      compiledContract: compiled,
      circuitId: 'prove_assets',
      contractAddress: assetProofAddress,
      privateStateKey: 'asset-proof-state',
      newPrivateState: {},
      args: [20n],
    });

    if (!result.public.txId) throw new Error('No txId in result');
  });

  // ── Test 4: lending_pool — deposit_liquidity ──────────────────────────────
  await test('lending_pool: deposit_liquidity (1 000 000 units)', async () => {
    const { compiled, zkConfigPath } = await loadCompiled('lending_pool');
    const providers = buildProviders(walletProvider, zkConfigPath);
    assertIsContractAddress(lendingPoolAddress);

    const result = await submitCallTx(providers, {
      compiledContract: compiled,
      circuitId: 'deposit_liquidity',
      contractAddress: lendingPoolAddress,
      privateStateKey: 'lending-pool-state',
      newPrivateState: {},
      args: [1_000_000n],
    });

    if (!result.public.txId) throw new Error('No txId in result');
  });

  // ── Test 5: lending_pool — request_loan ──────────────────────────────────
  await test('lending_pool: request_loan (grade B, $5000, 9% APR, 12 months)', async () => {
    const { zkConfigPath } = await loadCompiled('lending_pool');
    const mod = await import(pathToFileURL(path.join(MANAGED, 'lending_pool', 'contract', 'index.js')).href);
    const secretKey = new Uint8Array(32).fill(0x44);

    const contractInstance = new mod.Contract({
      local_secret_key: (_ctx: unknown) => [_ctx, secretKey] as [unknown, Uint8Array],
      current_block:    (_ctx: unknown) => [_ctx, 1n]        as [unknown, bigint],
    });

    const compiled = CompiledContract.make('lending_pool', contractInstance.constructor)
      .pipe(CompiledContract.withCompiledFileAssets(zkConfigPath));

    const providers = buildProviders(walletProvider, zkConfigPath);
    assertIsContractAddress(lendingPoolAddress);

    const scoreHash = new Uint8Array(32).fill(0);
    const result = await submitCallTx(providers, {
      compiledContract: compiled,
      circuitId: 'request_loan',
      contractAddress: lendingPoolAddress,
      privateStateKey: 'lending-pool-state',
      newPrivateState: {},
      args: [2n, true, scoreHash, false, 5_000n, 900n, 12n],
    });

    if (!result.public.txId) throw new Error('No txId in result');
  });

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n──────────────────────────────────────');
  console.log(`Results: ${passed} passed, ${failed} failed`);

  await walletProvider.stop();

  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
