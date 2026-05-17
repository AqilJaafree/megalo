import Navbar from '@/components/Navbar';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

const borrowerSteps = [
  {
    n: '01',
    title: 'Upload Documents',
    desc: 'Drag and drop pay stubs, bank statements, tax returns, or connect via Plaid. Files are parsed locally — never uploaded to a server.',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
      </svg>
    ),
  },
  {
    n: '02',
    title: 'AI Analyses Credit',
    desc: 'Claude extracts income stability, payment history, debt ratios, and cashflow patterns — qualitatively, with no raw numbers leaving your device.',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" /><path d="M12 8v4l3 3" />
      </svg>
    ),
  },
  {
    n: '03',
    title: 'ZK Proof Generated',
    desc: 'A zero-knowledge proof is created on your device. Only your credit grade (A/B/C) is published on the Midnight blockchain — never your underlying data.',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0110 0v4" />
      </svg>
    ),
  },
  {
    n: '04',
    title: 'Borrow from the Pool',
    desc: 'Post your loan request to the marketplace. Lenders see only your grade, amount, and AI note. Smart contracts handle disbursement and repayment.',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
      </svg>
    ),
  },
];

const lenderSteps = [
  {
    n: '01',
    title: 'Connect Your Wallet',
    desc: 'Connect a Midnight-compatible wallet to access the lending pool. Deposit liquidity to start earning yield from loan originations.',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="5" width="20" height="14" rx="2" /><line x1="2" y1="10" x2="22" y2="10" />
      </svg>
    ),
  },
  {
    n: '02',
    title: 'Browse Verified Borrowers',
    desc: "Review anonymised profiles — grade, loan amount, term, APR, and an AI-generated summary. No names, no documents, no personal data exposed.",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
    ),
  },
  {
    n: '03',
    title: 'Fund a Loan',
    desc: 'Select a borrower and click Fund. The smart contract locks your capital, verifies the ZK proof on-chain, and disburses funds atomically.',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 12 20 22 4 22 4 12" /><rect x="2" y="7" width="20" height="5" /><line x1="12" y1="22" x2="12" y2="7" /><path d="M12 7H7.5a2.5 2.5 0 010-5C11 2 12 7 12 7z" /><path d="M12 7h4.5a2.5 2.5 0 000-5C13 2 12 7 12 7z" />
      </svg>
    ),
  },
  {
    n: '04',
    title: 'Earn Yield',
    desc: 'Borrowers repay principal plus interest on-chain. Repayments flow directly back to your wallet. Default risk is mitigated by grade-based pool tiers.',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" /><polyline points="16 7 22 7 22 13" />
      </svg>
    ),
  },
];

function FlowColumn({ title, badge, steps, cta, href }: {
  title: string;
  badge: string;
  steps: typeof borrowerSteps;
  cta: string;
  href: string;
}) {
  return (
    <div className="flex flex-col">
      <div className="mb-20">
        <span className="text-xs font-medium px-3 py-1 rounded-full border border-[#7b8866]/40 bg-[#7b8866]/10 text-[#9aab82] uppercase tracking-wider">
          {badge}
        </span>
        <h2 className="text-2xl font-bold mt-3">{title}</h2>
      </div>

      <div className="flex flex-col flex-1">
        {steps.map((step, i) => (
          <div key={i} className="flex gap-5">
            {/* Icon + connector */}
            <div className="flex flex-col items-center">
              <div className="w-10 h-10 rounded-xl bg-[#7b8866]/15 border border-[#7b8866]/30 text-[#9aab82] flex items-center justify-center flex-shrink-0">
                {step.icon}
              </div>
              {i < steps.length - 1 && (
                <div className="w-px bg-[#7b8866]/20" style={{ flex: 1, minHeight: '2rem', margin: '8px 0' }} />
              )}
            </div>
            {/* Text */}
            <div style={{ paddingBottom: i < steps.length - 1 ? '2rem' : '0' }}>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[10px] font-mono text-[#7b8866]/60">{step.n}</span>
                <h3 className="text-sm font-semibold text-white">{step.title}</h3>
              </div>
              <p className="text-sm text-white/50 leading-relaxed">{step.desc}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4">
        <Link href={href}>
          <Button className="w-full">{cta}</Button>
        </Link>
      </div>
    </div>
  );
}

export default function HowItWorksPage() {
  return (
    <main className="min-h-screen bg-[#120F17] text-white">
      <Navbar />
      <div style={{ height: '80px' }} />

      <div className="flex justify-center px-6">
      <div className="w-full max-w-5xl">
        {/* Hero section */}
        <div className="text-center py-16 border-b border-[#7b8866]/10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[#7b8866]/40 bg-[#7b8866]/10 text-[#9aab82] text-xs font-medium uppercase tracking-wide mb-6">
     
            <span className="w-1.5 h-1.5 rounded-full bg-[#9aab82]" />
            Privacy-preserving by design
        
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold mb-4">How Midvault Works</h1>
          <p className="text-white/50 text-lg max-w-xl mx-auto leading-relaxed">
            Two roles, one protocol. Your data never leaves your device.
          </p>
        </div>

        {/* Flows */}
        <div className="py-16">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1px 1fr', gap: '0 3rem' }}>
            <FlowColumn
              badge="For Borrowers"
              title="Get funded without exposing your finances"
              steps={borrowerSteps}
              cta="Start as Borrower"
              href="/borrow/upload"
            />
            <div style={{ background: 'rgba(123,136,102,0.15)', alignSelf: 'stretch' }} />
            <FlowColumn
              badge="For Lenders"
              title="Fund verified loans, earn transparent yield"
              steps={lenderSteps}
              cta="Go to Dashboard"
              href="/lender/dashboard"
            />
          </div>
        </div>
      </div>
      </div>
    </main>
  );
}
