'use client';

import { useState, useCallback, DragEvent, ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import { Button } from '@/components/ui/button';

interface UploadedFile {
  name: string;
  size: number;
}

function StepBar({ active }: { active: number }) {
  const steps = ['Upload', 'Verify', 'Score'];
  return (
    <div className="flex items-center gap-2 mb-10">
      {steps.map((step, i) => (
        <div key={step} className="flex items-center gap-2">
          <div className={`flex items-center gap-1.5 text-xs font-medium ${i <= active ? 'text-[#9aab82]' : 'text-white/30'}`}>
            <span className={`w-5 h-5 rounded-full border flex items-center justify-center text-[10px] ${i < active ? 'border-[#7b8866] bg-[#7b8866] text-[#120F17]' : i === active ? 'border-[#7b8866] text-[#9aab82]' : 'border-white/20'}`}>
              {i < active ? '✓' : i + 1}
            </span>
            {step}
          </div>
          {i < steps.length - 1 && <span className="text-white/20 text-xs">—</span>}
        </div>
      ))}
    </div>
  );
}

export default function UploadPage() {
  const router = useRouter();
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [dragging, setDragging] = useState(false);

  const addFiles = (incoming: FileList | null) => {
    if (!incoming) return;
    setFiles(prev => [
      ...prev,
      ...Array.from(incoming).map(f => ({ name: f.name, size: f.size })),
    ]);
  };

  const handleDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    addFiles(e.dataTransfer.files);
  }, []);

  const formatSize = (b: number) =>
    b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1048576).toFixed(1)} MB`;

  return (
    <main className="min-h-screen bg-[#120F17] text-white flex flex-col">
      <Navbar />
      <div style={{ height: '80px' }} />

      <div className="flex-1 flex items-center justify-center px-6 py-10">
        <div className="w-full max-w-xl">
          <StepBar active={0} />

          <h1 className="text-3xl font-bold mb-2">Upload your documents</h1>
          <p className="text-white/50 text-sm mb-8 leading-relaxed">
            Files are parsed locally and never stored. Only a ZK proof leaves your device.
          </p>

          {/* Drop zone */}
          <div
            onDrop={handleDrop}
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            className={`rounded-2xl border-2 border-dashed transition-all duration-200 p-12 flex flex-col items-center gap-4 mb-6 ${
              dragging
                ? 'border-[#7b8866] bg-[#7b8866]/10'
                : 'border-[#7b8866]/30 bg-[#16131d] hover:border-[#7b8866]/60 hover:bg-[#7b8866]/5'
            }`}
          >
            <div></div>
            <div className="w-14 h-14 rounded-xl bg-[#7b8866]/15 border border-[#7b8866]/30 flex items-center justify-center">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#9aab82" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            </div>
            <div className="text-center">
              <p className="text-white font-medium mb-1">Drop files here or click to browse</p>
              <p className="text-white/40 text-xs">PDF, JPG, PNG — pay stubs, tax returns, bank statements</p>
            </div>
            <label className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg font-medium transition-all duration-200 h-8 px-3 text-xs border border-[#7b8866]/60 text-[#7b8866] hover:bg-[#7b8866] hover:text-[#120F17] cursor-pointer">

              Browse files
      
              <input
                type="file"
                multiple
                accept=".pdf,.jpg,.jpeg,.png"
                className="hidden"
                onChange={(e: ChangeEvent<HTMLInputElement>) => addFiles(e.target.files)}
              />
            </label>
            <div></div>
          </div>
          
          
          {/* File list */}
          {files.length > 0 && (
            
            <div className="mb-6 space-y-2">
              {files.map((file, i) => (
                <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-[#16131d] border border-[#7b8866]/20">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded bg-[#7b8866]/15 flex items-center justify-center flex-shrink-0">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9aab82" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                      </svg>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm text-white truncate">{file.name}</p>
                      <p className="text-xs text-white/40">{formatSize(file.size)}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))}
                    className="text-white/30 hover:text-white/60 transition-colors ml-3"
                  >
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                      <path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}

          <Button
            className="w-full"
            size="lg"
            disabled={files.length === 0}
            onClick={() => router.push('/borrow/verify')}
          >
            Upload &amp; Analyse
          </Button>
        </div>
      </div>
    </main>
  );
}
