'use client';

import { useEffect, useState } from 'react';
import Navbar from '@/components/Navbar';
import AnimatedList from '@/components/AnimatedList';
import BorrowerCard from '@/components/BorrowerCard';
import { Button } from '@/components/ui/button';
import { mockBorrowers, BorrowerData } from '@/lib/mock-data';

interface PoolState {
  totalLiquidity: number;
  totalLent: number;
  utilisationBps: number;
}

export default function LenderDashboard() {
  const [pool, setPool] = useState<PoolState | null>(null);
  const [poolError, setPoolError] = useState(false);

  useEffect(() => {
    fetch('/api/contract/pool')
      .then(r => r.json() as Promise<PoolState>)
      .then(d => {
        if ('error' in d) { setPoolError(true); return; }
        setPool(d);
      })
      .catch(() => setPoolError(true));
  }, []);

  const totalLiquidity = pool?.totalLiquidity ?? 0;
  const utilisationPct = pool ? Math.round(pool.utilisationBps / 100) : 0;

  const handleFund = (borrower: BorrowerData) => {
    alert(`Funding loan for ${borrower.id} — $${borrower.amountRequested.toLocaleString()} at ${(borrower.aprBps / 100).toFixed(2)}% APR`);
  };

  return (
    <main className="min-h-screen bg-[#120F17] text-white">
      <Navbar />
      <div style={{ height: '80px' }} />

      <div className="flex justify-center">
        <div className="w-full max-w-2xl px-6 py-10">

          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold mb-1">Lender Dashboard</h1>
            <p className="text-white/40 text-sm">Browse verified borrowers and fund loans</p>
          </div>

          {/* Pool stats */}
          <div className="grid grid-cols-3 gap-4 mb-10">
            <div className="p-4 rounded-xl bg-[#16131d] border border-[#7b8866]/20 text-center">
              <p className="text-xs text-white/40 uppercase tracking-wider mb-1">Pool Liquidity</p>
              {pool === null && !poolError ? (
                <div className="h-7 flex items-center justify-center">
                  <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="#7b8866" strokeWidth="3" strokeDasharray="40 60" />
                  </svg>
                </div>
              ) : poolError ? (
                <p className="text-sm text-white/30">—</p>
              ) : (
                <p className="text-xl font-bold">
                  ${totalLiquidity >= 1000 ? `${(totalLiquidity / 1000).toFixed(0)}k` : totalLiquidity}
                </p>
              )}
            </div>
            <div className="p-4 rounded-xl bg-[#16131d] border border-[#7b8866]/20 text-center">
              <p className="text-xs text-white/40 uppercase tracking-wider mb-2">Utilisation</p>
              {pool === null && !poolError ? (
                <div className="h-7 flex items-center justify-center">
                  <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="#7b8866" strokeWidth="3" strokeDasharray="40 60" />
                  </svg>
                </div>
              ) : (
                <>
                  <p className="text-xl font-bold mb-2">{poolError ? '—' : `${utilisationPct}%`}</p>
                  <div className="h-1.5 rounded-full bg-[#7b8866]/15 overflow-hidden">
                    <div className="h-full rounded-full bg-[#7b8866]" style={{ width: `${utilisationPct}%` }} />
                  </div>
                </>
              )}
            </div>
            <div className="p-4 rounded-xl bg-[#16131d] border border-[#7b8866]/20 text-center">
              <p className="text-xs text-white/40 uppercase tracking-wider mb-1">Active Requests</p>
              <p className="text-xl font-bold">{mockBorrowers.length}</p>
            </div>
          </div>

          {poolError && (
            <p className="text-xs text-white/30 mb-4">Pool data unavailable — contract may not be deployed yet.</p>
          )}

          {/* Deposit button */}
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold">Active Applications</h2>
            <div className="flex items-center gap-3">
              <div className="flex gap-1.5">
                {(['A', 'B', 'C'] as const).map(grade => (
                  <Button key={grade} variant="ghost" size="sm" className="px-2.5 h-7 text-xs">
                    {grade}
                  </Button>
                ))}
              </div>
              <Button variant="secondary" size="sm">
                Deposit
              </Button>
            </div>
          </div>

          <AnimatedList
            items={mockBorrowers}
            showGradients
            enableArrowNavigation
            displayScrollbar
            renderItem={(borrower: BorrowerData, isSelected: boolean) => (
              <BorrowerCard
                borrower={borrower}
                isSelected={isSelected}
                showFundButton
                onFund={handleFund}
              />
            )}
          />
        </div>
      </div>
    </main>
  );
}
