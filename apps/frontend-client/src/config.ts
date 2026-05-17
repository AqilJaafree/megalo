export interface MidnightConfig {
  networkId: 'testnet' | 'mainnet';
  rpcUrl: string;
  proofServerUrl: string;
}

export const MIDNIGHT_CONFIG: MidnightConfig = {
  networkId: (process.env.MIDNIGHT_NETWORK_ID ?? 'testnet') as 'testnet' | 'mainnet',
  rpcUrl: process.env.MIDNIGHT_RPC_URL!,
  proofServerUrl: process.env.MIDNIGHT_PROOF_SERVER_URL!,
};

export const CONTRACT_ADDRESSES = {
  lendingPool: process.env.LENDING_POOL_ADDRESS! as `0x${string}`,
  governance: process.env.GOVERNANCE_ADDRESS! as `0x${string}`,
};

export const ANTHROPIC_MODEL = 'claude-sonnet-4-20250514';

// Grade → APR band in basis points — two sets: attested vs standard
// Must mirror grade_rate_band() in lending_pool.compact exactly
export const GRADE_RATE_BANDS = {
  attested: {
    A: [350, 650] as [number, number],
    B: [650, 950] as [number, number],
    C: [950, 1300] as [number, number],
  },
  standard: {
    A: [500, 800] as [number, number],
    B: [800, 1100] as [number, number],
    C: [1100, 1500] as [number, number],
  },
} as const;

export const MAX_TERM_MONTHS = 60;
export const DEFAULT_ASSET_SCORE = 50; // neutral default when no asset docs provided
