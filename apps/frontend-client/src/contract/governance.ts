import { WeightRecommendation } from '../types';
import { CONTRACT_ADDRESSES } from '../config';
import type { MidnightProvider } from './lending-pool';

export interface GovernanceState {
  multisigThreshold: number;
  approvedWeights: WeightRecommendation['newWeights'];
}

export interface Proposal {
  proposalId: `0x${string}`;
  newWeights: WeightRecommendation['newWeights'];
  rationaleHash: `0x${string}`;
  approvalCount: number;
  executed: boolean;
}

export async function getGovernanceState(provider: MidnightProvider): Promise<GovernanceState> {
  const state = await provider.queryContractState(CONTRACT_ADDRESSES.governance);
  const w = state['approved_weights'] as Record<string, unknown>;

  return {
    multisigThreshold: Number(state['multisig_threshold']),
    approvedWeights: {
      income:      Number(w['income']),
      debt:        Number(w['debt']),
      payments:    Number(w['payments']),
      cashflow:    Number(w['cashflow']),
      utilisation: Number(w['utilisation']),
      assets:      Number(w['assets']),
    },
  };
}

// Propose a new weight update on-chain — returns the proposal ID
export async function proposeWeightUpdate(
  recommendation: WeightRecommendation,
  rationaleHash: `0x${string}`,
  provider: MidnightProvider,
): Promise<`0x${string}`> {
  const w = recommendation.newWeights;

  const sum = Object.values(w).reduce((a, b) => a + b, 0);
  if (sum !== 100) throw new Error(`Weights must sum to 100, got ${sum}`);

  const tx = await provider.callContract(CONTRACT_ADDRESSES.governance, 'propose_weight_update', {
    new_income:      w.income,
    new_debt:        w.debt,
    new_payments:    w.payments,
    new_cashflow:    w.cashflow,
    new_utilisation: w.utilisation,
    new_assets:      w.assets,
    rationale_hash:  rationaleHash,
  });

  return tx.transactionHash as `0x${string}`;
}

// Cast a governor approval vote for an existing proposal
export async function approveProposal(
  proposalId: `0x${string}`,
  provider: MidnightProvider,
): Promise<void> {
  await provider.callContract(CONTRACT_ADDRESSES.governance, 'approve_proposal', {
    proposal_id: proposalId,
  });
}

export async function getProposal(
  proposalId: `0x${string}`,
  provider: MidnightProvider,
): Promise<Proposal> {
  const p = await provider.queryContractState(
    CONTRACT_ADDRESSES.governance,
    `proposals.${proposalId}`,
  );
  const w = p['new_weights'] as Record<string, unknown>;

  return {
    proposalId,
    newWeights: {
      income:      Number(w['income']),
      debt:        Number(w['debt']),
      payments:    Number(w['payments']),
      cashflow:    Number(w['cashflow']),
      utilisation: Number(w['utilisation']),
      assets:      Number(w['assets']),
    },
    rationaleHash: p['rationale_hash'] as `0x${string}`,
    approvalCount: Number(p['approval_count']),
    executed: Boolean(p['executed']),
  };
}
