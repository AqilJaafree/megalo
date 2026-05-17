export interface BorrowerData {
  id: string;
  grade: 'A' | 'B' | 'C';
  amountRequested: number;
  suggestedPayback: number;
  termMonths: number;
  aprBps: number;
  aiNote: string;
  attested: boolean;
}

export const mockBorrowers: BorrowerData[] = [
  {
    id: '0x7f3a...b291',
    grade: 'A',
    amountRequested: 15000,
    suggestedPayback: 17250,
    termMonths: 24,
    aprBps: 850,
    aiNote: 'Strong income consistency with low utilisation. Attested via Plaid.',
    attested: true,
  },
  {
    id: '0x3c8d...f104',
    grade: 'A',
    amountRequested: 8500,
    suggestedPayback: 9520,
    termMonths: 12,
    aprBps: 720,
    aiNote: 'Excellent payment history. Low debt-to-income ratio.',
    attested: true,
  },
  {
    id: '0x9e2b...7ac3',
    grade: 'B',
    amountRequested: 22000,
    suggestedPayback: 26400,
    termMonths: 36,
    aprBps: 1100,
    aiNote: 'Moderate cashflow volatility offset by strong asset base.',
    attested: false,
  },
  {
    id: '0x1d5f...2e87',
    grade: 'B',
    amountRequested: 5000,
    suggestedPayback: 5750,
    termMonths: 12,
    aprBps: 920,
    aiNote: 'Good payment record, slight utilisation pressure.',
    attested: true,
  },
  {
    id: '0xab4c...3d19',
    grade: 'A',
    amountRequested: 30000,
    suggestedPayback: 34500,
    termMonths: 48,
    aprBps: 800,
    aiNote: 'High income stability, diverse asset coverage across brokerage and pension.',
    attested: true,
  },
  {
    id: '0x6f7e...c504',
    grade: 'C',
    amountRequested: 3000,
    suggestedPayback: 3720,
    termMonths: 12,
    aprBps: 1400,
    aiNote: 'Below-average utilisation score. Cashflow shows irregular patterns.',
    attested: false,
  },
  {
    id: '0xd2a1...8b37',
    grade: 'B',
    amountRequested: 12000,
    suggestedPayback: 14040,
    termMonths: 24,
    aprBps: 1000,
    aiNote: 'Stable employment history. Moderate existing debt commitments.',
    attested: true,
  },
  {
    id: '0x5e9c...1f62',
    grade: 'A',
    amountRequested: 50000,
    suggestedPayback: 56500,
    termMonths: 60,
    aprBps: 780,
    aiNote: 'Very strong all-round profile. Fully attested open banking data.',
    attested: true,
  },
];
