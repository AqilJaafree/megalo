'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';

const STEPS = [
  { label: 'Parsing documents', duration: 1500 },
  { label: 'Analysing credit features', duration: 2000 },
  { label: 'Generating ZK proof', duration: 2500 },
  { label: 'Proof verified on-chain', duration: 800 },
];

export default function VerifyPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);

  useEffect(() => {
    let stepIndex = 0;
    const runSteps = () => {
      if (stepIndex >= STEPS.length) {
        setTimeout(() => router.push('/borrow/score'), 600);
        return;
      }
      setCurrentStep(stepIndex);
      setTimeout(() => {
        setCompletedSteps(prev => [...prev, stepIndex]);
        stepIndex++;
        runSteps();
      }, STEPS[stepIndex].duration);
    };
    runSteps();
  }, [router]);

  return (
    <main className="min-h-screen bg-[#120F17] text-white flex flex-col">
      <Navbar />
      <div style={{ height: '80px' }} />

      <div className="flex-1 flex items-center justify-center px-6">
        <div className="w-full max-w-md">
          {/* Step bar */}
          <div className="flex items-center gap-2 mb-12 justify-center">
            {['Upload', 'Verify', 'Score'].map((step, i) => (
              <div key={step} className="flex items-center gap-2">
                <div className={`flex items-center gap-1.5 text-xs font-medium ${i <= 1 ? 'text-[#9aab82]' : 'text-white/30'}`}>
                  <span className={`w-5 h-5 rounded-full border flex items-center justify-center text-[10px] ${i === 0 ? 'border-[#7b8866] bg-[#7b8866] text-[#120F17]' : i === 1 ? 'border-[#7b8866] text-[#9aab82]' : 'border-white/20'}`}>
                    {i === 0 ? '✓' : i + 1}
                  </span>
                  {step}
                </div>
                {i < 2 && <span className="text-white/20 text-xs">—</span>}
              </div>
            ))}
          </div>

          <div className="text-center mb-10">
            <h1 className="text-2xl font-bold mb-2">Verifying your documents</h1>
            <p className="text-white/40 text-sm">Your data never leaves this device</p>
          </div>

          <div className="space-y-3">
            {STEPS.map((step, i) => {
              const isDone = completedSteps.includes(i);
              const isActive = currentStep === i && !isDone;
              return (
                <div
                  key={i}
                  className={`flex items-center gap-4 p-4 rounded-xl border transition-all duration-500 ${
                    isDone
                      ? 'border-[#7b8866]/40 bg-[#7b8866]/5'
                      : isActive
                      ? 'border-[#7b8866]/60 bg-[#16131d]'
                      : 'border-white/5 bg-transparent opacity-40'
                  }`}
                >
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-300 ${
                    isDone ? 'bg-[#7b8866]' : isActive ? 'bg-[#7b8866]/20 border border-[#7b8866]/50' : 'bg-white/5'
                  }`}>
                    {isDone ? (
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <path d="M2 7l3.5 3.5L12 3" stroke="#120F17" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    ) : isActive ? (
                      <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none">
                        <circle cx="12" cy="12" r="10" stroke="#7b8866" strokeWidth="3" strokeDasharray="40 60" />
                      </svg>
                    ) : (
                      <span className="text-xs text-white/30">{i + 1}</span>
                    )}
                  </div>
                  <span className={`text-sm font-medium flex-1 ${isDone ? 'text-[#9aab82]' : isActive ? 'text-white' : 'text-white/30'}`}>
                    {step.label}
                  </span>
                  {isActive && <span className="text-xs text-[#7b8866] animate-pulse">Processing…</span>}
                  {isDone && <span className="text-xs text-[#7b8866]/60">Done</span>}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </main>
  );
}
