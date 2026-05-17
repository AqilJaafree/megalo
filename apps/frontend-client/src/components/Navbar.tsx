'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function Navbar() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 h-20 flex items-center justify-between px-8 border-b border-[#7b8866]/20 backdrop-blur-md bg-[#120F17]/70">
      <div className="flex items-center gap-10">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-[#7b8866] flex items-center justify-center flex-shrink-0">
            <svg width="19" height="19" viewBox="0 0 18 18" fill="none">
              <path d="M9 2L15.5 5.5V12.5L9 16L2.5 12.5V5.5L9 2Z" stroke="#120F17" strokeWidth="1.5" strokeLinejoin="round" />
              <path d="M9 6V12M6 7.5L9 6L12 7.5" stroke="#120F17" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <span className="text-lg font-semibold tracking-tight">Midvault</span>
        </Link>

        <Link
          href="/how-it-works"
          className="text-sm font-bold text-[#7b8866] hover:text-white transition-colors duration-200"
        >
          How it works
        </Link>
      </div>

      <Button variant="outline" size="sm">
        Connect Wallet
      </Button>
    </nav>
  );
}
