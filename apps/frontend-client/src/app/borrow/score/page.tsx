'use client';

import { useEffect, useState } from 'react';
import Navbar from '@/components/Navbar';
import AnimatedList from '@/components/AnimatedList';
import BorrowerCard from '@/components/BorrowerCard';
import { Button } from '@/components/ui/button';
import { mockBorrowers, BorrowerData } from '@/lib/mock-data';
import { CreditFeatures, CreditGrade, CreditProofOutput, ScoreExplanation } from '@/types';

interface ChatMessage {
  role: 'user' | 'ai';
  text: string;
}

const GRADE_COLOR: Record<CreditGrade, string> = {
  A: 'text-emerald-400',
  B: 'text-yellow-400',
  C: 'text-orange-400',
  rejected: 'text-red-400',
};

const GRADE_BADGE: Record<CreditGrade, string> = {
  A: 'bg-emerald-400/10 border-emerald-400/30 text-emerald-400',
  B: 'bg-yellow-400/10 border-yellow-400/30 text-yellow-400',
  C: 'bg-orange-400/10 border-orange-400/30 text-orange-400',
  rejected: 'bg-red-400/10 border-red-400/30 text-red-400',
};

function toQuality(score: number): 'High' | 'Good' | 'Moderate' | 'Low' {
  if (score >= 75) return 'High';
  if (score >= 55) return 'Good';
  if (score >= 35) return 'Moderate';
  return 'Low';
}

export default function ScorePage() {
  const [proof, setProof] = useState<CreditProofOutput | null>(null);
  const [features, setFeatures] = useState<CreditFeatures | null>(null);
  const [explanation, setExplanation] = useState<ScoreExplanation | null>(null);
  const [chatInput, setChatInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [borrowedId, setBorrowedId] = useState<string | null>(null);

  useEffect(() => {
    const proofRaw    = sessionStorage.getItem('megalo_proof_result');
    const featuresRaw = sessionStorage.getItem('megalo_features');

    const p: CreditProofOutput = proofRaw ? JSON.parse(proofRaw) : {
      grade: 'A' as CreditGrade,
      isEligible: true,
      scoreHash: '0x' + '0'.repeat(64) as `0x${string}`,
      attested: false,
    };
    const f: CreditFeatures = featuresRaw ? JSON.parse(featuresRaw) : {
      avgMonthlyIncomeScore: 82,
      debtRatioScore: 74,
      paymentHistoryScore: 91,
      cashflowVolatilityScore: 68,
      creditUtilisationScore: 79,
      assetSufficiencyScore: 55,
    };

    setProof(p);
    setFeatures(f);

    // Load AI explanation
    fetch('/api/ai/explain-score', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grade: p.grade,
        qualitativeHints: {
          incomeStability:      toQuality(f.avgMonthlyIncomeScore),
          paymentRecord:        toQuality(f.paymentHistoryScore),
          existingCommitments:  toQuality(f.debtRatioScore),
        },
      }),
    })
      .then(r => r.json() as Promise<ScoreExplanation>)
      .then(exp => {
        setExplanation(exp);
        setMessages([{ role: 'ai', text: exp.summary }]);
      })
      .catch(() => {
        setMessages([{ role: 'ai', text: `Your credit proof has been generated — Grade ${p.grade}. What would you like to know?` }]);
      });
  }, []);

  const scoreBreakdown = features ? [
    { label: 'Income Stability', score: features.avgMonthlyIncomeScore },
    { label: 'Payment History', score: features.paymentHistoryScore },
    { label: 'Debt Ratio',      score: features.debtRatioScore },
    { label: 'Cashflow',        score: features.cashflowVolatilityScore },
    { label: 'Utilisation',     score: features.creditUtilisationScore },
    { label: 'Assets',          score: features.assetSufficiencyScore },
  ] : [];

  const overallScore = scoreBreakdown.length
    ? Math.round(scoreBreakdown.reduce((s, b) => s + b.score, 0) / scoreBreakdown.length)
    : 0;

  const grade = proof?.grade ?? 'A';

  const sendMessage = async () => {
    const text = chatInput.trim();
    if (!text || chatLoading) return;
    setMessages(prev => [...prev, { role: 'user', text }]);
    setChatInput('');
    setChatLoading(true);

    // Use explanation factors if available for the response
    if (explanation) {
      const factorText = explanation.factors
        .map(f => `${f.label}: ${f.quality}`)
        .join(', ');
      setMessages(prev => [...prev, {
        role: 'ai',
        text: `Based on your profile — ${factorText}. ${explanation.summary}`,
      }]);
      setChatLoading(false);
    } else {
      setMessages(prev => [...prev, {
        role: 'ai',
        text: 'Your ZK proof ensures lenders only see your credit grade — never your raw financials or identity.',
      }]);
      setChatLoading(false);
    }
  };

  return (
    <main className="bg-[#120F17] text-white flex flex-col" style={{ height: '100vh' }}>
      <Navbar />
      <div style={{ height: '80px', flexShrink: 0 }} />

      {/* Step bar */}
      <div className="flex items-center gap-2 px-6 py-4 border-b border-[#7b8866]/10" style={{ flexShrink: 0 }}>
        {['Upload', 'Verify', 'Score'].map((step, i) => (
          <div key={step} className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 text-xs font-medium text-[#9aab82]">
              <span className={`w-5 h-5 rounded-full border border-[#7b8866] flex items-center justify-center text-[10px] ${i < 2 ? 'bg-[#7b8866] text-[#120F17]' : 'text-[#9aab82]'}`}>
                {i < 2 ? '✓' : '3'}
              </span>
              {step}
            </div>
            {i < 2 && <span className="text-white/20 text-xs">—</span>}
          </div>
        ))}
      </div>

      {/* Two-column body */}
      <div className="flex flex-1 overflow-hidden gap-4">

        {/* Left: Credit Score + AI Chat */}
        <div className="overflow-y-auto border-r border-[#7b8866]/20 p-6 flex flex-col gap-5" style={{ width: '380px', flexShrink: 0 }}>

          {/* Score card */}
          <div className="bg-[#16131d] border border-[#7b8866]/20 rounded-2xl p-5">
            <h2 className="text-base font-bold mb-4">Your Credit Score</h2>

            <div className="flex items-center gap-5 mb-5">
              {/* Ring */}
              <div className="relative flex-shrink-0" style={{ width: 96, height: 96 }}>
                <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
                  <circle cx="60" cy="60" r="50" fill="none" stroke="#7b8866" strokeOpacity="0.15" strokeWidth="10" />
                  <circle cx="60" cy="60" r="50" fill="none" stroke="#9aab82" strokeWidth="10" strokeLinecap="round"
                    strokeDasharray={`${(overallScore / 100) * 314} 314`} />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-xl font-bold">{overallScore}</span>
                  <span className="text-[10px] text-white/40">/ 100</span>
                </div>
              </div>

              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-2xl font-bold ${GRADE_COLOR[grade]}`}>Grade {grade}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${GRADE_BADGE[grade]}`}>
                    {proof?.isEligible ? 'Eligible' : 'Ineligible'}
                  </span>
                </div>
                <p className="text-xs text-white/40 leading-relaxed">
                  {grade === 'A' ? 'Qualifies for all pool tiers'
                    : grade === 'B' ? 'Qualifies for standard pool tiers'
                    : grade === 'C' ? 'Qualifies for basic pool tier'
                    : 'Does not meet minimum threshold'}
                </p>
                {proof?.attested && (
                  <p className="text-xs text-[#9aab82] mt-1">Attested via open banking</p>
                )}
              </div>
            </div>

            {/* Score breakdown bars */}
            <div className="space-y-2">
              {scoreBreakdown.map(({ label, score }) => (
                <div key={label} className="flex items-center gap-3">
                  <span className="text-xs text-white/50 w-28 flex-shrink-0">{label}</span>
                  <div className="flex-1 h-1.5 rounded-full bg-[#7b8866]/15 overflow-hidden">
                    <div className="h-full rounded-full bg-[#9aab82]" style={{ width: `${score}%` }} />
                  </div>
                  <span className="text-xs text-white/40 w-6 text-right">{score}</span>
                </div>
              ))}
            </div>
          </div>

          {/* AI Chat */}
          <div className="bg-[#16131d] border border-[#7b8866]/20 rounded-2xl p-4 flex flex-col gap-3">
            <p className="text-xs font-semibold text-white/60 uppercase tracking-wider">AI Assistant</p>

            <div className="flex flex-col gap-2 max-h-52 overflow-y-auto pr-1">
              {messages.length === 0 && (
                <div className="flex items-center gap-2">
                  <svg className="animate-spin" width="12" height="12" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="#7b8866" strokeWidth="3" strokeDasharray="40 60" />
                  </svg>
                  <span className="text-xs text-white/30">Generating explanation…</span>
                </div>
              )}
              {messages.map((msg, i) => (
                <div key={i} className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {msg.role === 'ai' && (
                    <div className="w-5 h-5 rounded-full bg-[#7b8866]/20 border border-[#7b8866]/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#9aab82" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" /><path d="M12 8v4l3 3" />
                      </svg>
                    </div>
                  )}
                  <div className={`rounded-xl px-3 py-2 text-xs leading-relaxed ${
                    msg.role === 'ai'
                      ? 'bg-[#1e1b28] border border-[#7b8866]/20 text-white/70'
                      : 'bg-[#7b8866]/20 border border-[#7b8866]/30 text-white'
                  }`} style={{ maxWidth: '85%' }}>
                    {msg.text}
                  </div>
                </div>
              ))}
              {chatLoading && (
                <div className="flex gap-2 justify-start">
                  <div className="w-5 h-5 rounded-full bg-[#7b8866]/20 border border-[#7b8866]/30 flex items-center justify-center flex-shrink-0">
                    <svg className="animate-spin" width="10" height="10" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="10" stroke="#7b8866" strokeWidth="3" strokeDasharray="40 60" />
                    </svg>
                  </div>
                  <div className="rounded-xl px-3 py-2 text-xs bg-[#1e1b28] border border-[#7b8866]/20 text-white/30">
                    Thinking…
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <input
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && sendMessage()}
                placeholder="Ask about your score…"
                className="flex-1 bg-[#1e1b28] border border-[#7b8866]/20 rounded-lg px-3 py-2 text-xs text-white placeholder-white/30 focus:outline-none focus:border-[#7b8866]/60 transition-colors"
              />
              <Button size="sm" onClick={sendMessage} disabled={chatLoading}>Send</Button>
            </div>
          </div>
        </div>

        {/* Right: Marketplace */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-bold">Marketplace</h2>
              <p className="text-xs text-white/40">Select a loan offer and borrow instantly</p>
            </div>
            <span className="text-xs px-2 py-1 rounded-full bg-[#7b8866]/10 border border-[#7b8866]/30 text-[#9aab82]">
              {mockBorrowers.length} active
            </span>
          </div>

          <div className="h-4" />

          {borrowedId && (
            <div className="mb-4 flex items-center gap-2 p-3 rounded-xl bg-emerald-400/5 border border-emerald-400/20 text-emerald-400 text-sm">
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                <path d="M3 8l3 3 7-7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Loan request posted — lenders will be notified
            </div>
          )}

          <AnimatedList
            items={mockBorrowers}
            showGradients
            enableArrowNavigation
            displayScrollbar
            renderItem={(borrower: BorrowerData, isSelected: boolean) => (
              <BorrowerCard
                borrower={borrower}
                isSelected={isSelected}
                showBorrowButton
                onBorrow={b => setBorrowedId(b.id)}
              />
            )}
          />
        </div>
      </div>
    </main>
  );
}
