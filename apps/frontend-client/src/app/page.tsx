'use client';

import { useState } from 'react';
import ShapeGrid from '@/components/ShapeGrid';
import RoleModal from '@/components/RoleModal';
import Navbar from '@/components/Navbar';
import { Button } from '@/components/ui/button';

export default function Home() {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <main className="min-h-screen bg-[#120F17] text-white">
      <Navbar />

      <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0">
          <ShapeGrid
            speed={0.5}
            squareSize={40}
            direction="diagonal"
            borderColor="#7b8866"
            hoverFillColor="#22251e"
            shape="hexagon"
            hoverTrailAmount={0}
          />
        </div>

        <div className="relative z-10 text-center max-w-3xl px-6 flex flex-col items-center">
          <div className="mb-6 inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[#7b8866]/40 bg-[#7b8866]/10 text-[#9aab82] text-xs font-medium tracking-wide uppercase">

            <span className="w-1.5 h-1.5 rounded-full bg-[#9aab82] animate-pulse" />
            Built on Midnight Network

          </div>

          <h1 className="text-5xl sm:text-6xl md:text-7xl font-bold leading-tight tracking-tight mb-6">
            Credit, without
            <br />
            <span className="text-[#9aab82]">the surveillance</span>
          </h1>

          <p className="text-lg sm:text-xl text-white/60 mb-10 max-w-lg leading-relaxed">
            A credit score that travels with you.
            <br />
            Your data doesn&apos;t.
          </p>

          <div className="items-center">
            <Button size="lg" onClick={() => setModalOpen(true)}>
              Get Started
            </Button>
          </div>
        </div>

        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-[#120F17] to-transparent pointer-events-none" />
      </section>

      <RoleModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </main>
  );
}
