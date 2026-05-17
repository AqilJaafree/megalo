# Megalo

Privacy-preserving TradFi lending protocol built on the [Midnight](https://midnight.network) blockchain.

Borrowers prove creditworthiness with zero-knowledge proofs — lenders see grades, not raw data. No credit scores, bank statements, or personal financials ever leave the user's device.

---

## How it works

```
User uploads documents
        │
        ▼
  Claude AI parses & normalises → CreditFeatures (never stored)
        │
        ▼
  ZK proof generated on-device → grade A/B/C + score hash
        │
        ▼
  credit_proof contract verifies → eligibility stored on-chain
        │
        ▼
  lending_pool contract disburses loan at governance-approved APR
```

**Four Compact smart contracts:**

| Contract | Role |
|---|---|
| `credit_proof` | Computes weighted credit grade from private scores; writes grade + eligibility on-chain |
| `asset_proof` | Proves liquid / illiquid asset ratios without revealing amounts |
| `lending_pool` | Manages deposits, loan requests, repayments, and defaults |
| `governance` | Multisig weight updates — governors vote to adjust scoring weights |

---

## Monorepo structure

```
megalo/
├── apps/
│   └── frontend-client/     # Next.js 15 borrower/lender UI
├── packages/
│   └── contract/
│       ├── contracts/        # Compact source (.compact)
│       ├── managed/          # Compiler output — gitignored
│       └── scripts/
│           ├── deploy.ts     # Deploy all 4 contracts locally
│           └── test-local.ts # Integration tests against local node
├── docker-compose.yml        # Local Midnight stack
└── DEPLOY.md                 # Full deployment walkthrough
```

---

## Quick start

### 1. Start the local Midnight network

```bash
docker compose up -d
```

### 2. Install dependencies

```bash
pnpm install
```

### 3. Compile contracts

```bash
export PATH="$HOME/.compact/bin:$PATH"
pnpm --filter contract build
```

### 4. Deploy contracts

```bash
pnpm --filter contract run deploy
```

Contract addresses are written to `.env.local` automatically.

### 5. Run the frontend

```bash
pnpm --filter frontend-client dev
```

Open [http://localhost:3000](http://localhost:3000).

> See [DEPLOY.md](./DEPLOY.md) for the full deployment guide, troubleshooting, and testnet instructions.

---

## Environment variables

Copy the example and fill in your values:

```bash
cp apps/frontend-client/.env.local.example apps/frontend-client/.env.local
```

| Variable | Description |
|---|---|
| `ANTHROPIC_API_KEY` | Claude API key for document parsing |
| `PLAID_CLIENT_ID` | Plaid client ID (open banking) |
| `PLAID_SECRET` | Plaid secret |
| `PLAID_ENV` | `sandbox` / `development` / `production` |
| `MIDNIGHT_NETWORK_ID` | `undeployed` (local) or `preprod` (testnet) |
| `LENDING_POOL_ADDRESS` | Deployed lending pool contract address |
| `GOVERNANCE_ADDRESS` | Deployed governance contract address |

> **Never commit `.env` or `.env.local`** — they are gitignored.

---

## Tech stack

| Layer | Technology |
|---|---|
| Blockchain | [Midnight](https://midnight.network) — ZK privacy chain |
| Smart contracts | [Compact](https://docs.midnight.network/compact) language |
| ZK proofs | Midnight proof server (Docker) |
| Frontend | Next.js 15, React 19, TypeScript |
| AI document parsing | Anthropic Claude (`claude-sonnet-4-6`) |
| Open banking | Plaid API |
| Monorepo | Turborepo + pnpm workspaces |

---

## Security

- Raw financial figures never leave the prover — only structured feature objects and ZK proof outputs are used
- The `attested` flag must originate from the proof server or Plaid OAuth, never from user input
- Credit weights must sum to 100 before being passed to governance
- All Claude API calls go through wrapper functions; never call the API directly

---

## License

Apache 2.0
