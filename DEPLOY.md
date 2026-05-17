# Midvault — Local Deployment Guide

Deploys all 4 Compact contracts (`credit_proof`, `asset_proof`, `lending_pool`, `governance`) to a local Midnight network running in Docker.

## Prerequisites

- Docker + Docker Compose
- Node.js ≥ 20 + pnpm
- Compact compiler installed at `~/.compact/` (see [Midnight docs](https://docs.midnight.network))

Verify the compiler is on your PATH:
```bash
export PATH="$HOME/.compact/bin:$PATH"
compactc --version
```

---

## Step 1 — Start the local Midnight stack

```bash
docker compose up -d
```

This starts three containers:

| Container | Port | Purpose |
|---|---|---|
| `midnight-node` | 9944 | Substrate-based blockchain node |
| `midnight-indexer` | 8088 | GraphQL indexer (public state) |
| `midnight-proof-server` | 6300 | ZK proof generation |

Wait until the node is healthy before deploying:
```bash
docker compose ps   # all should show "healthy" or "running"
```

---

## Step 2 — Install dependencies

```bash
pnpm install
```

> **Note:** The repo uses `node-linker=hoisted` (`.npmrc`) for flat `node_modules`. Do not remove this — it prevents ESM isolation issues with Midnight SDK packages.

---

## Step 3 — Compile the contracts

```bash
export PATH="$HOME/.compact/bin:$PATH"
pnpm --filter contract build
```

This runs `compactc` four times and outputs circuit artifacts to `packages/contract/managed/`.

---

## Step 4 — Deploy

```bash
export PATH="$HOME/.compact/bin:$PATH"
pnpm --filter contract run deploy
```

The script:
1. Creates a wallet from the genesis seed (`000...001`)
2. Waits for wallet sync against the local indexer
3. Deploys each contract in sequence, running their constructors with initial state
4. Writes all contract addresses to `.env.local` at the repo root

### Expected output

```
Midvault — deploying to local Midnight network
  Indexer:      http://127.0.0.1:8088/api/v4/graphql
  Node:         ws://127.0.0.1:9944
  Proof server: http://127.0.0.1:6300
─────────────────────────────────────────
Building wallet...
Waiting for wallet sync...
Wallet synced.

Deploying credit_proof...
  ✓ credit_proof → <address>
Deploying asset_proof...
  ✓ asset_proof  → <address>
Deploying lending_pool...
  ✓ lending_pool → <address>
Deploying governance...
  ✓ governance   → <address>

─────────────────────────────────────────
All contracts deployed. Addresses written to .env.local
```

---

## Contract constructor state

| Contract | Constructor seeds |
|---|---|
| `credit_proof` | Credit weights: income 20, debt 20, payments 20, cashflow 15, utilisation 15, assets 10 |
| `lending_pool` | Same weights + governor from deploy key, threshold = 1 |
| `governance` | Governor from deploy key, threshold = 1, same initial weights |
| `asset_proof` | No constructor (all witnesses are circuit-time only) |

---

## Custom deploy seed

The default seed is the Midnight genesis wallet (`000...001`). To use a different funded wallet:

```bash
DEPLOY_SEED=<64-hex-char-seed> pnpm --filter contract run deploy
```

---

## Teardown

```bash
docker compose down -v   # -v removes volumes (resets chain state)
```

After teardown, re-deploying will produce new contract addresses — update `.env.local` accordingly.

---

## Troubleshooting

| Error | Fix |
|---|---|
| `compactc: command not found` | `export PATH="$HOME/.compact/bin:$PATH"` |
| `Artifact missing: managed/…` | Run `pnpm --filter contract build` first |
| `Insufficient pool liquidity` | Expected — pool starts empty; deposit liquidity before requesting loans |
| Wallet sync hangs | Check Docker containers are running: `docker compose ps` |
| `Cannot connect to ws://127.0.0.1:9944` | Node container not ready yet — wait and retry |
