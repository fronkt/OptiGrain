"use client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import type { AnalysisResult } from "@/lib/api";

interface Props {
  analysis: AnalysisResult | null;
}

const ASTM_DESCRIPTIONS: Record<number, string> = {
  1: "Very coarse", 2: "Coarse", 3: "Medium-coarse", 4: "Medium",
  5: "Medium-fine", 6: "Fine", 7: "Fine", 8: "Very fine",
  9: "Ultra-fine", 10: "Ultra-fine", 11: "Nano", 12: "Nano",
};

function astmLabel(g: number) {
  const key = Math.max(1, Math.min(12, Math.round(g)));
  return ASTM_DESCRIPTIONS[key] ?? "—";
}

function gradeColor(g: number) {
  if (g >= 8) return "text-[#00ff88]";
  if (g >= 5) return "text-amber-400";
  return "text-orange-500";
}

export function StatsPanel({ analysis }: Props) {
  const rows = analysis
    ? [
        {
          property: "Avg Grain Diameter",
          value: `${analysis.average_grain_size_microns.toFixed(2)} μm`,
          grade: astmLabel(analysis.astm_grain_number),
          highlight: true,
        },
        {
          property: "ASTM E112 Grain No.",
          value: `G = ${analysis.astm_grain_number.toFixed(2)}`,
          grade: astmLabel(analysis.astm_grain_number),
          highlight: true,
        },
        {
          property: "Grain Count (VLM est.)",
          value: analysis.grain_count > 0 ? String(analysis.grain_count) : "—",
          grade: "",
          highlight: false,
        },
        {
          property: "Confidence Score",
          value: `${(analysis.confidence_score * 100).toFixed(1)}%`,
          grade: analysis.confidence_score > 0.75 ? "High" : analysis.confidence_score > 0.5 ? "Medium" : "Low",
          highlight: false,
        },
      ]
    : [];

  return (
    <div className="og-card p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-mono text-muted-foreground uppercase tracking-widest">
          ASTM E112 — Grain Statistics
        </span>
        {analysis && (
          <span className={`text-xs font-mono font-bold ${gradeColor(analysis.astm_grain_number)}`}>
            G = {analysis.astm_grain_number.toFixed(1)}
          </span>
        )}
      </div>

      <Table>
        <TableHeader>
          <TableRow className="border-white/5">
            <TableHead className="text-[10px] font-mono text-muted-foreground uppercase w-[220px]">Property</TableHead>
            <TableHead className="text-[10px] font-mono text-muted-foreground uppercase">Value</TableHead>
            <TableHead className="text-[10px] font-mono text-muted-foreground uppercase">Grade / Classification</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {analysis === null ? (
            <TableRow>
              <TableCell colSpan={3} className="text-center text-xs text-muted-foreground/40 font-mono py-8">
                Upload and analyze a micrograph to populate statistics
              </TableCell>
            </TableRow>
          ) : (
            rows.map((r) => (
              <TableRow key={r.property} className="border-white/5 hover:bg-white/[0.02]">
                <TableCell className="text-xs text-muted-foreground font-mono">{r.property}</TableCell>
                <TableCell className={`text-xs font-mono font-semibold ${r.highlight ? "text-[#00ff88]" : "text-foreground"}`}>
                  {r.value}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground font-mono">{r.grade}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      {analysis && analysis.detected_defects.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          <span className="text-[10px] font-mono text-muted-foreground/50 self-center mr-1">Defects:</span>
          {analysis.detected_defects.map((d) => (
            <Badge key={d} variant="outline" className="text-[10px] font-mono border-orange-500/30 text-orange-400 bg-orange-500/5">
              {d}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
