'use client';

import { BorrowerData } from '@/lib/mock-data';
import { Button } from '@/components/ui/button';

const gradeColors: Record<string, string> = {
  A: 'text-emerald-400 border-emerald-400/40 bg-emerald-400/10',
  B: 'text-yellow-400 border-yellow-400/40 bg-yellow-400/10',
  C: 'text-red-400 border-red-400/40 bg-red-400/10',
};

interface BorrowerCardProps {
  borrower: BorrowerData;
  isSelected?: boolean;
  showFundButton?: boolean;
  onFund?: (borrower: BorrowerData) => void;
  showBorrowButton?: boolean;
  onBorrow?: (borrower: BorrowerData) => void;
}

export default function BorrowerCard({
  borrower,
  isSelected = false,
  showFundButton = false,
  onFund,
  showBorrowButton = false,
  onBorrow,
}: BorrowerCardProps) {
  return (
    <div
      className={`rounded-xl border p-4 transition-all duration-200 ${
        isSelected
          ? 'bg-[#1e1b28] border-[#7b8866]/60'
          : 'bg-[#16131d] border-[#7b8866]/20 hover:border-[#7b8866]/40'
      }`}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs text-white/40 font-mono truncate">{borrower.id}</span>
          {borrower.attested && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#7b8866]/20 text-[#9aab82] border border-[#7b8866]/30 flex-shrink-0">
              Attested
            </span>
          )}
        </div>
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full border flex-shrink-0 ml-2 ${gradeColors[borrower.grade]}`}>
          {borrower.grade}
        </span>
      </div>

      {/* Financials */}
      <div className="grid grid-cols-3 gap-3 mb-3">
        <div>
          <p className="text-[10px] text-white/40 uppercase tracking-wider mb-0.5">Requesting</p>
          <p className="text-sm font-semibold">${borrower.amountRequested.toLocaleString()}</p>
        </div>
        <div>
          <p className="text-[10px] text-white/40 uppercase tracking-wider mb-0.5">Payback</p>
          <p className="text-sm font-semibold">${borrower.suggestedPayback.toLocaleString()}</p>
        </div>
        <div>
          <p className="text-[10px] text-white/40 uppercase tracking-wider mb-0.5">Term</p>
          <p className="text-sm font-semibold">{borrower.termMonths}mo</p>
        </div>
      </div>

      <div className="mb-3">
        <span className="text-[10px] text-white/40 uppercase tracking-wider">APR </span>
        <span className="text-xs text-[#9aab82] font-medium">{(borrower.aprBps / 100).toFixed(2)}%</span>
      </div>

      {/* AI note */}
      <div className="flex gap-2 p-2.5 rounded-lg bg-[#120F17] border border-[#7b8866]/10 mb-3">
        <svg className="w-3.5 h-3.5 text-[#7b8866] flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <circle cx="12" cy="12" r="10" strokeWidth="1.5" />
          <path d="M12 8v4l3 3" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <p className="text-xs text-white/50 leading-relaxed">{borrower.aiNote}</p>
      </div>

      {showFundButton && (
        <Button className="w-full" onClick={e => { e.stopPropagation(); onFund?.(borrower); }}>
          Fund Loan
        </Button>
      )}

      {showBorrowButton && (
        <Button className="w-full" onClick={e => { e.stopPropagation(); onBorrow?.(borrower); }}>
          Borrow Now
        </Button>
      )}
      
    </div>
  );
}
