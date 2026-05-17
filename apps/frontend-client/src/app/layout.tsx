import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Midvault',
  description: 'Privacy-preserving TradFi lending on Midnight',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-[#120F17] text-white antialiased">{children}</body>
    </html>
  );
}
