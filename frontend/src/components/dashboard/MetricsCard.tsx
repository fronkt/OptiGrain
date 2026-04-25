"use client";
import { Progress } from "@/components/ui/progress";
import type { AnalysisResult } from "@/lib/api";

type Status = "idle" | "uploading" | "analyzing" | "contouring" | "done" | "error";

interface Props {
  status: Status;
  analysis: AnalysisResult | null;
  elapsed: number | null;
  error: string | null;
}

const STATUS_LABELS: Record<Status, string> = {
  idle: "Awaiting input",
  uploading: "Preprocessing image…",
  analyzing: "Querying VLM…",
  contouring: "Segmenting grains…",
  done: "Analysis complete",
  error: "Error",
};

const STATUS_COLORS: Record<Status, string> = {
  idle: "text-muted-foreground/40",
  uploading: "text-amber-400",
  analyzing: "text-[#7c3aed]",
  contouring: "text-amber-400",
  done: "text-[#00ff88]",
  error: "text-destructive",
};

function ConfidenceGauge({ score }: { score: number }) {
  const r = 36;
  const circ = 2 * Math.PI * r;
  const dash = circ * score;
  const color = score > 0.75 ? "#00ff88" : score > 0.5 ? "#f59e0b" : "#f97316";

  return (
    <div className="relative flex items-center justify-center">
      <svg width="88" height="88" className="-rotate-90">
        <circle cx="44" cy="44" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="6" />
        <circle
          cx="44" cy="44" r={r} fill="none"
          stroke={color} strokeWidth="6"
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          style={{ transition: "stroke-dasharray 0.6s ease" }}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="font-mono text-lg font-bold" style={{ color }}>{Math.round(score * 100)}%</span>
        <span className="text-[9px] font-mono text-muted-foreground/50 uppercase">conf</span>
      </div>
    </div>
  );
}

export function MetricsCard({ status, analysis, elapsed, error }: Props) {
  return (
    <div className="og-card p-4 flex flex-col gap-4">
      <span className="text-xs font-mono text-muted-foreground uppercase tracking-widest">System Status</span>

      {/* Status indicator */}
      <div className="flex items-center gap-2">
        <span className={`inline-block w-2 h-2 rounded-full ${status === "done" ? "bg-[#00ff88]" : status === "error" ? "bg-destructive" : "bg-amber-400 og-pulse"}`} />
        <span className={`text-xs font-mono ${STATUS_COLORS[status]}`}>{STATUS_LABELS[status]}</span>
      </div>

      {/* Progress bar while processing */}
      {(status === "uploading" || status === "analyzing" || status === "contouring") && (
        <Progress value={null} className="h-1 bg-white/5" />
      )}

      {/* Confidence gauge */}
      {analysis && (
        <div className="flex flex-col items-center gap-2">
          <ConfidenceGauge score={analysis.confidence_score} />
          <div className="w-full grid grid-cols-2 gap-x-4 gap-y-1 text-[10px] font-mono">
            <span className="text-muted-foreground/50">Grain size</span>
            <span className="text-[#00ff88] text-right">{analysis.average_grain_size_microns.toFixed(1)} μm</span>
            <span className="text-muted-foreground/50">ASTM G</span>
            <span className="text-[#00ff88] text-right">{analysis.astm_grain_number.toFixed(1)}</span>
            <span className="text-muted-foreground/50">Defects</span>
            <span className={`text-right ${analysis.detected_defects.length > 0 ? "text-orange-400" : "text-muted-foreground/40"}`}>
              {analysis.detected_defects.length > 0 ? analysis.detected_defects.length : "none"}
            </span>
          </div>
        </div>
      )}

      {/* Error */}
      {error && <p className="text-[10px] font-mono text-destructive break-all">{error}</p>}

      {/* Elapsed */}
      {elapsed !== null && status === "done" && (
        <div className="mt-auto text-[10px] font-mono text-muted-foreground/30">
          Completed in {(elapsed / 1000).toFixed(1)}s
        </div>
      )}

      {/* Decorative scanline */}
      <div className="og-scanline absolute inset-0 rounded-[0.75rem] pointer-events-none" />
    </div>
  );
}
