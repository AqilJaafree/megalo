'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

interface RoleModalProps {
  open: boolean;
  onClose: () => void;
}

export default function RoleModal({ open, onClose }: RoleModalProps) {
  const router = useRouter();

  if (!open) return null;

  const handleSelect = (role: 'borrower' | 'lender') => {
    onClose();
    router.push(role === 'borrower' ? '/borrow/upload' : '/lender/dashboard');
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative z-10 bg-[#1a1621] border border-[#7b8866]/30 rounded-2xl p-8 w-full max-w-md mx-4 shadow-2xl">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-white/30 hover:text-white/70 transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>

        <h2 className="text-2xl font-bold text-center mb-1">How do you want to proceed?</h2>
        <p className="text-white/40 text-sm text-center mb-8">Choose your role to continue</p>

        <div className="grid grid-cols-2 gap-4">
          <button
            onClick={() => handleSelect('borrower')}
            className="group flex flex-col items-center gap-3 p-6 rounded-xl border border-[#7b8866]/20 hover:border-[#7b8866] hover:bg-[#7b8866]/10 transition-all duration-200"
          >
            <div className="w-12 h-12 rounded-full bg-[#7b8866]/15 border border-[#7b8866]/30 flex items-center justify-center group-hover:bg-[#7b8866]/25 transition-colors duration-200">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#9aab82" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 12V22H4V12" /><path d="M22 7H2v5h20V7z" /><path d="M12 22V7" />
                <path d="M12 7H7.5a2.5 2.5 0 010-5C11 2 12 7 12 7z" />
                <path d="M12 7h4.5a2.5 2.5 0 000-5C13 2 12 7 12 7z" />
              </svg>
            </div>
            <div className="text-center">
              <p className="font-semibold text-white mb-1">Borrower</p>
              <p className="text-xs text-white/40 leading-relaxed">Apply for a privacy-preserving loan</p>
            </div>
          </button>

          <button
            onClick={() => handleSelect('lender')}
            className="group flex flex-col items-center gap-3 p-6 rounded-xl border border-[#7b8866]/20 hover:border-[#7b8866] hover:bg-[#7b8866]/10 transition-all duration-200"
          >
            <div className="w-12 h-12 rounded-full bg-[#7b8866]/15 border border-[#7b8866]/30 flex items-center justify-center group-hover:bg-[#7b8866]/25 transition-colors duration-200">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#9aab82" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="1" x2="12" y2="23" />
                <path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
              </svg>
            </div>
            <div className="text-center">
              <p className="font-semibold text-white mb-1">Lender</p>
              <p className="text-xs text-white/40 leading-relaxed">Fund loans and earn yield</p>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
