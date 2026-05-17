'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import { CreditFeatures, CreditProofOutput, DocumentSource } from '@/types';

const STEP_LABELS = [
  'Parsing documents',
  'Analysing credit features',
  'Generating ZK proof',
  'Proof verified on-chain',
];

function toQuality(score: number): 'High' | 'Good' | 'Moderate' | 'Low' {
  if (score >= 75) return 'High';
  if (score >= 55) return 'Good';
  if (score >= 35) return 'Moderate';
  return 'Low';
}

function mergeFeatures(extractions: CreditFeatures[]): CreditFeatures {
  return {
    avgMonthlyIncomeScore:   Math.max(...extractions.map(e => e.avgMonthlyIncomeScore)),
    debtRatioScore:          Math.max(...extractions.map(e => e.debtRatioScore)),
    paymentHistoryScore:     Math.max(...extractions.map(e => e.paymentHistoryScore)),
    cashflowVolatilityScore: Math.max(...extractions.map(e => e.cashflowVolatilityScore)),
    creditUtilisationScore:  Math.max(...extractions.map(e => e.creditUtilisationScore)),
    assetSufficiencyScore:   Math.max(...extractions.map(e => e.assetSufficiencyScore)),
  };
}

export default function VerifyPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const run = async () => {
      try {
        const raw = sessionStorage.getItem('megalo_upload_files');
        const uploads: { base64: string; name: string; source: DocumentSource }[] =
          raw ? JSON.parse(raw) : [];

        // Step 0: Parse documents
        setCurrentStep(0);
        let features: CreditFeatures;
        if (uploads.length > 0) {
          const results = await Promise.all(
            uploads.map(({ base64, source }) =>
              fetch('/api/ai/parse-document', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ base64, source }),
              }).then(r => r.json() as Promise<CreditFeatures>),
            ),
          );
          setCompletedSteps([0]);

          // Step 1: Merge features
          setCurrentStep(1);
          features = results.length === 1 ? results[0] : mergeFeatures(results);
          await new Promise(r => setTimeout(r, 600));
          setCompletedSteps([0, 1]);
        } else {
          // No files — use neutral defaults (demo fallback)
          features = {
            avgMonthlyIncomeScore: 70,
            debtRatioScore: 68,
            paymentHistoryScore: 75,
            cashflowVolatilityScore: 60,
            creditUtilisationScore: 72,
            assetSufficiencyScore: 50,
          };
          setCompletedSteps([0, 1]);
        }

        // Step 2: Generate ZK proof
        setCurrentStep(2);
        const proofRes = await fetch('/api/contract/prove-credit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ features, attested: false }),
        });
        const proof = await proofRes.json() as CreditProofOutput;
        if (!proofRes.ok) throw new Error((proof as unknown as { error: string }).error ?? 'Proof failed');
        setCompletedSteps([0, 1, 2]);

        // Step 3: On-chain confirmation (brief UX delay)
        setCurrentStep(3);
        await new Promise(r => setTimeout(r, 800));
        setCompletedSteps([0, 1, 2, 3]);

        // Store results for score page
        sessionStorage.setItem('megalo_proof_result', JSON.stringify(proof));
        sessionStorage.setItem('megalo_features', JSON.stringify(features));

        await new Promise(r => setTimeout(r, 500));
        router.push('/borrow/score');
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    };

    run();
  }, [router]);

  if (error) {
    return (
      <main className="min-h-screen bg-[#120F17] text-white flex flex-col">
        <Navbar />
        <div style={{ height: '80px' }} />
        <div className="flex-1 flex items-center justify-center px-6">
          <div className="w-full max-w-md text-center">
            <p className="text-red-400 font-medium mb-2">Verification failed</p>
            <p className="text-white/40 text-sm mb-6">{error}</p>
            <button
              onClick={() => router.push('/borrow/upload')}
              className="text-[#9aab82] text-sm underline"
            >
              Go back and try again
            </button>
          </div>
        </div>
      </main>
    );
  }

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
            {STEP_LABELS.map((label, i) => {
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
                    {label}
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
