import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Midvault',
  description: 'Privacy-preserving TradFi lending on Midnight',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
