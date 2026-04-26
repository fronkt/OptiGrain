import { BentoDashboard } from "@/components/dashboard/BentoDashboard";

export default function Page() {
  return (
    <main className="min-h-screen bg-[#080b12]">
      <header className="border-b border-white/5 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded bg-[#00ff88]/10 border border-[#00ff88]/20 flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#00ff88" strokeWidth="2">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <span className="font-mono text-sm font-semibold tracking-tight">
            OptiGrain<span className="text-[#00ff88]"> AI</span>
          </span>
          <span className="text-[10px] font-mono text-muted-foreground/40 border border-white/5 rounded px-1.5 py-0.5">v1.0</span>
        </div>
        <div className="flex items-center gap-4 text-[11px] font-mono text-muted-foreground/40">
          <span>ASTM E112</span>
          <span className="w-1 h-1 rounded-full bg-white/10" />
          <span>Materials Project</span>
          <span className="w-1 h-1 rounded-full bg-white/10" />
          <span>OpenRouter VLM</span>
        </div>
      </header>
      <BentoDashboard />
    </main>
  );
}
