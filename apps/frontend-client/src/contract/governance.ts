import { WeightRecommendation } from '../types';

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

export async function getGovernanceState(): Promise<GovernanceState> {
  const res = await fetch('/api/contract/governance', { cache: 'no-store' });
  if (!res.ok) throw new Error(`getGovernanceState failed: ${res.statusText}`);
  return res.json() as Promise<GovernanceState>;
}

export async function proposeWeightUpdate(
  recommendation: WeightRecommendation,
  rationaleHash: `0x${string}`,
): Promise<`0x${string}`> {
  const w = recommendation.newWeights;
  const sum = Object.values(w).reduce((a, b) => a + b, 0);
  if (sum !== 100) throw new Error(`Weights must sum to 100, got ${sum}`);

  const res = await fetch('/api/contract/governance/propose', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ newWeights: w, rationaleHash }),
  });
  if (!res.ok) throw new Error(`proposeWeightUpdate failed: ${res.statusText}`);
  const data = await res.json() as { proposalId: `0x${string}` };
  return data.proposalId;
}

export async function approveProposal(proposalId: `0x${string}`): Promise<void> {
  const res = await fetch('/api/contract/governance/approve', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ proposalId }),
  });
  if (!res.ok) throw new Error(`approveProposal failed: ${res.statusText}`);
}
