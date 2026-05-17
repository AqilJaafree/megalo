'use client';

import { useState } from 'react';
import Navbar from '@/components/Navbar';
import AnimatedList from '@/components/AnimatedList';
import BorrowerCard from '@/components/BorrowerCard';
import { Button } from '@/components/ui/button';
import { mockBorrowers, BorrowerData } from '@/lib/mock-data';

const scoreBreakdown = [
  { label: 'Income Stability', score: 82 },
  { label: 'Payment History', score: 91 },
  { label: 'Debt Ratio', score: 74 },
  { label: 'Cashflow', score: 68 },
  { label: 'Utilisation', score: 79 },
  { label: 'Assets', score: 55 },
];

interface ChatMessage {
  role: 'user' | 'ai';
  text: string;
}

export default function ScorePage() {
  const [chatInput, setChatInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'ai', text: 'Your credit proof has been generated. Grade A — you qualify for competitive rates. What would you like to know?' },
  ]);
  const [borrowedId, setBorrowedId] = useState<string | null>(null);

  const overallScore = Math.round(scoreBreakdown.reduce((s, b) => s + b.score, 0) / scoreBreakdown.length);

  const sendMessage = () => {
    const text = chatInput.trim();
    if (!text) return;
    setMessages(prev => [
      ...prev,
      { role: 'user', text },
      { role: 'ai', text: 'Your ZK proof ensures lenders only see your credit grade — never your raw financials or identity.' },
    ]);
    setChatInput('');
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

        {/* ── Left: Credit Score + AI Chat ── */}
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
                  <span className="text-2xl font-bold text-emerald-400">Grade A</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-400/10 border border-emerald-400/30 text-emerald-400">Eligible</span>
                </div>
                <p className="text-xs text-white/40 leading-relaxed">Qualifies for all pool tiers</p>
              </div>
            </div>

          </div>

          {/* AI Chat */}
          <div className="bg-[#16131d] border border-[#7b8866]/20 rounded-2xl p-4 flex flex-col gap-3">
            <p className="text-xs font-semibold text-white/60 uppercase tracking-wider">AI Assistant</p>

            <div className="flex flex-col gap-2 max-h-52 overflow-y-auto pr-1">
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
            </div>

            <div className="flex gap-2">
              <input
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && sendMessage()}
                placeholder="Ask about your score…"
                className="flex-1 bg-[#1e1b28] border border-[#7b8866]/20 rounded-lg px-3 py-2 text-xs text-white placeholder-white/30 focus:outline-none focus:border-[#7b8866]/60 transition-colors"
              />
              <Button size="sm" onClick={sendMessage}>Send</Button>
            </div>
          </div>
        </div>

        {/* ── Right: Marketplace ── */}
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
            
          <div className="h-4"></div>

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
