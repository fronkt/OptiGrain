"use client";
import { useEffect, useRef, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ContourData, MaterialPhase, GrainParams, Seed } from "@/lib/api";
import { lookupMaterials } from "@/lib/api";

interface Props {
  contours: ContourData | null;
  materials: MaterialPhase[] | null;
  onMaterialsLookup: (phases: MaterialPhase[]) => void;
  grainParams: GrainParams;
  seeds: Seed[];
  seedSensitivity: number;
  onReprocessGrains: (params: GrainParams, seeds: Seed[]) => void;
  onFetchSeeds: (sensitivity: number) => void;
  onAddSeed: (x: number, y: number) => void;
  onRemoveSeeds: (x0: number, y0: number, x1: number, y1: number) => void;
  onAnnotateGrain: (x0: number, y0: number, x1: number, y1: number) => void;
  isReprocessing: boolean;
  isTraining: boolean;
  hasFile: boolean;
  originalUrl: string | null;
}

// ── Slider ────────────────────────────────────────────────────────────────────
function ParamSlider({ label, unit, value, min, max, step, onChange }: {
  label: string; unit: string; value: number;
  min: number; max: number; step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-[10px] font-mono text-muted-foreground">
        <span>{label}</span>
        <span className="text-[#00ff88]/80">{value}{unit}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1 appearance-none rounded bg-white/10 accent-[#00ff88] cursor-pointer"
      />
      <div className="flex justify-between text-[9px] font-mono text-muted-foreground/30">
        <span>{min}</span><span>{max}</span>
      </div>
    </div>
  );
}

// ── Grain overlay canvas ──────────────────────────────────────────────────────
function GrainOverlay({ contours }: { contours: ContourData | null }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!contours || !ref.current) return;
    const img = new Image();
    img.onload = () => {
      const c = ref.current!;
      c.width = img.width; c.height = img.height;
      c.getContext("2d")!.drawImage(img, 0, 0);
    };
    img.src = `data:image/png;base64,${contours.overlay_base64}`;
  }, [contours]);

  if (!contours) return (
    <div className="flex items-center justify-center h-full min-h-[100px] text-xs text-muted-foreground font-mono opacity-40">
      Run analysis to generate grain mask
    </div>
  );
  return (
    <canvas ref={ref} className="w-full h-full object-contain rounded" style={{ imageRendering: "pixelated" }} />
  );
}

// ── Seed canvas (interactive) ─────────────────────────────────────────────────
function SeedCanvas({
  originalUrl, seeds, mode, onAddSeed, onRemoveSeeds,
}: {
  originalUrl: string;
  seeds: Seed[];
  mode: "add" | "erase";
  onAddSeed: (x: number, y: number) => void;
  onRemoveSeeds: (x0: number, y0: number, x1: number, y1: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [erasing, setErasing] = useState(false);
  const [eraseStart, setEraseStart] = useState<{ x: number; y: number } | null>(null);
  const [eraseRect, setEraseRect] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);

  const toNorm = (e: React.MouseEvent) => {
    const b = containerRef.current!.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (e.clientX - b.left) / b.width)),
      y: Math.max(0, Math.min(1, (e.clientY - b.top) / b.height)),
    };
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (mode === "add") {
      onAddSeed(toNorm(e).x, toNorm(e).y);
    } else {
      const pt = toNorm(e);
      setEraseStart(pt);
      setErasing(true);
      setEraseRect(null);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!erasing || !eraseStart) return;
    const pt = toNorm(e);
    setEraseRect({ x0: eraseStart.x, y0: eraseStart.y, x1: pt.x, y1: pt.y });
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (!erasing || !eraseStart) return;
    const pt = toNorm(e);
    setErasing(false);
    setEraseRect(null);
    const r = {
      x0: Math.min(eraseStart.x, pt.x), y0: Math.min(eraseStart.y, pt.y),
      x1: Math.max(eraseStart.x, pt.x), y1: Math.max(eraseStart.y, pt.y),
    };
    onRemoveSeeds(r.x0, r.y0, r.x1, r.y1);
  };

  return (
    <div
      ref={containerRef}
      className="relative select-none w-full h-full min-h-[100px] overflow-hidden rounded"
      style={{ cursor: mode === "add" ? "crosshair" : "cell" }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={() => { setErasing(false); setEraseRect(null); }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={originalUrl} alt="" className="w-full h-full object-contain" draggable={false} />

      <svg className="absolute inset-0 w-full h-full pointer-events-none">
        {seeds.map((s, i) => (
          <g key={i}>
            <circle
              cx={`${s.x * 100}%`} cy={`${s.y * 100}%`}
              r="5" fill="rgba(220,40,40,0.9)" stroke="white" strokeWidth="1.5"
            />
          </g>
        ))}
        {eraseRect && (
          <rect
            x={`${Math.min(eraseRect.x0, eraseRect.x1) * 100}%`}
            y={`${Math.min(eraseRect.y0, eraseRect.y1) * 100}%`}
            width={`${Math.abs(eraseRect.x1 - eraseRect.x0) * 100}%`}
            height={`${Math.abs(eraseRect.y1 - eraseRect.y0) * 100}%`}
            fill="rgba(255,40,40,0.08)"
            stroke="rgba(255,80,80,0.8)"
            strokeWidth="1"
            strokeDasharray="5 3"
          />
        )}
      </svg>
    </div>
  );
}

// ── Annotation canvas (calibrate from one grain) ──────────────────────────────
function AnnotationCanvas({
  originalUrl, onConfirm, onCancel, isTraining,
}: {
  originalUrl: string;
  onConfirm: (x0: number, y0: number, x1: number, y1: number) => void;
  onCancel: () => void;
  isTraining: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [drawing, setDrawing] = useState(false);
  const [start, setStart] = useState<{ x: number; y: number } | null>(null);
  const [rect, setRect] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);

  const toNorm = (e: React.MouseEvent<HTMLDivElement>) => {
    const b = containerRef.current!.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (e.clientX - b.left) / b.width)),
      y: Math.max(0, Math.min(1, (e.clientY - b.top) / b.height)),
    };
  };

  const onMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    const pt = toNorm(e); setStart(pt); setRect(null); setDrawing(true);
  };
  const onMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!drawing || !start) return;
    const pt = toNorm(e);
    setRect({ x0: start.x, y0: start.y, x1: pt.x, y1: pt.y });
  };
  const onMouseUp = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!drawing || !start) return;
    const pt = toNorm(e);
    setRect({ x0: start.x, y0: start.y, x1: pt.x, y1: pt.y });
    setDrawing(false);
  };

  const boxStyle = rect ? {
    left: `${Math.min(rect.x0, rect.x1) * 100}%`,
    top: `${Math.min(rect.y0, rect.y1) * 100}%`,
    width: `${Math.abs(rect.x1 - rect.x0) * 100}%`,
    height: `${Math.abs(rect.y1 - rect.y0) * 100}%`,
  } : null;

  return (
    <div className="flex flex-col gap-2 h-full">
      <p className="text-[10px] font-mono text-[#7c3aed]/70">
        Draw a box around ONE grain to auto-calibrate seed sensitivity for this image.
      </p>
      <div
        ref={containerRef}
        className="relative select-none flex-1 min-h-[120px] rounded overflow-hidden cursor-crosshair"
        onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp}
        onMouseLeave={() => setDrawing(false)}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={originalUrl} alt="Calibrate" className="w-full h-full object-contain" draggable={false} />
        {boxStyle && (
          <div className="absolute pointer-events-none" style={{ ...boxStyle, border: "2px solid #7c3aed", boxShadow: "0 0 0 9999px rgba(0,0,0,0.45)" }}>
            {[["top-0 left-0","-translate-x-px -translate-y-px"],["top-0 right-0","translate-x-px -translate-y-px"],
              ["bottom-0 left-0","-translate-x-px translate-y-px"],["bottom-0 right-0","translate-x-px translate-y-px"],
            ].map(([pos, tr], i) => (
              <div key={i} className={`absolute ${pos} w-2 h-2 border-2 border-[#7c3aed] bg-[#080b12] transform ${tr}`} />
            ))}
          </div>
        )}
      </div>
      <div className="flex gap-2">
        <Button size="sm" disabled={!rect || isTraining}
          onClick={() => rect && onConfirm(rect.x0, rect.y0, rect.x1, rect.y1)}
          className="flex-1 bg-[#7c3aed]/10 hover:bg-[#7c3aed]/20 text-[#7c3aed] border border-[#7c3aed]/20 font-mono text-xs">
          {isTraining ? "Calibrating…" : "Calibrate from Grain"}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}
          className="font-mono text-xs text-muted-foreground hover:text-foreground">
          Cancel
        </Button>
      </div>
    </div>
  );
}

// ── Visual mask tab ────────────────────────────────────────────────────────────
function VisualMaskTab({
  contours, params, seeds, seedSensitivity,
  onReprocess, onFetchSeeds, onAddSeed, onRemoveSeeds, onAnnotateGrain,
  isReprocessing, isTraining, hasFile, originalUrl,
}: {
  contours: ContourData | null;
  params: GrainParams;
  seeds: Seed[];
  seedSensitivity: number;
  onReprocess: (p: GrainParams, s: Seed[]) => void;
  onFetchSeeds: (sensitivity: number) => void;
  onAddSeed: (x: number, y: number) => void;
  onRemoveSeeds: (x0: number, y0: number, x1: number, y1: number) => void;
  onAnnotateGrain: (x0: number, y0: number, x1: number, y1: number) => void;
  isReprocessing: boolean;
  isTraining: boolean;
  hasFile: boolean;
  originalUrl: string | null;
}) {
  const [localParams, setLocalParams] = useState<GrainParams>(params);
  const [localSeedSens, setLocalSeedSens] = useState(seedSensitivity);
  const [dirty, setDirty] = useState(false);
  const [seedMode, setSeedMode] = useState<"add" | "erase">("add");
  const [editingSeeds, setEditingSeeds] = useState(false);
  const [annotating, setAnnotating] = useState(false);

  const setParam = (key: keyof GrainParams, val: number | boolean) => {
    setLocalParams((p) => ({ ...p, [key]: val }));
    setDirty(true);
  };

  if (annotating && originalUrl) {
    return (
      <AnnotationCanvas
        originalUrl={originalUrl}
        onConfirm={(x0, y0, x1, y1) => { setAnnotating(false); onAnnotateGrain(x0, y0, x1, y1); }}
        onCancel={() => setAnnotating(false)}
        isTraining={isTraining}
      />
    );
  }

  if (editingSeeds && originalUrl) {
    return (
      <div className="flex flex-col gap-2 h-full">
        {/* Seed editing header */}
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">
            Seed Editor — {seeds.length} seed{seeds.length !== 1 ? "s" : ""}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSeedMode("add")}
              className={`text-[10px] font-mono px-2 py-0.5 rounded border transition-colors ${
                seedMode === "add"
                  ? "bg-[#00ff88]/10 text-[#00ff88] border-[#00ff88]/30"
                  : "text-muted-foreground border-white/10 hover:border-white/20"
              }`}
            >
              + Add
            </button>
            <button
              onClick={() => setSeedMode("erase")}
              className={`text-[10px] font-mono px-2 py-0.5 rounded border transition-colors ${
                seedMode === "erase"
                  ? "bg-red-500/10 text-red-400 border-red-500/30"
                  : "text-muted-foreground border-white/10 hover:border-white/20"
              }`}
            >
              ✕ Erase
            </button>
          </div>
        </div>

        <p className="text-[9px] font-mono text-muted-foreground/50 leading-relaxed">
          {seedMode === "add"
            ? "Click to place a seed inside a grain interior."
            : "Drag a rectangle to remove all seeds within the selection."}
        </p>

        <div className="flex-1 min-h-[120px]">
          <SeedCanvas
            originalUrl={originalUrl}
            seeds={seeds}
            mode={seedMode}
            onAddSeed={onAddSeed}
            onRemoveSeeds={onRemoveSeeds}
          />
        </div>

        <div className="flex gap-2">
          <Button
            size="sm"
            disabled={!hasFile || isReprocessing || seeds.length === 0}
            onClick={() => { onReprocess(localParams, seeds); setEditingSeeds(false); }}
            className="flex-1 bg-[#00ff88]/10 hover:bg-[#00ff88]/20 text-[#00ff88] border border-[#00ff88]/20 font-mono text-xs"
          >
            {isReprocessing ? "Processing…" : "Segment from Seeds"}
          </Button>
          <Button
            size="sm" variant="ghost" onClick={() => setEditingSeeds(false)}
            className="font-mono text-xs text-muted-foreground hover:text-foreground"
          >
            Done
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 h-full">
      {/* Settings panel */}
      <div className="border border-white/5 rounded-lg p-3 bg-white/[0.02] flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">
            Detection Settings
          </span>
          {seeds.length > 0 && (
            <span className="text-[9px] font-mono text-[#00ff88]/50 border border-[#00ff88]/20 rounded px-1.5 py-0.5">
              {seeds.length} seeds
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3">
          <ParamSlider
            label="Seed sensitivity" unit=""
            value={localSeedSens}
            min={1} max={99} step={1}
            onChange={(v) => { setLocalSeedSens(v); setDirty(true); }}
          />
          <ParamSlider
            label="Min grain size" unit=" px"
            value={localParams.min_grain_px ?? 100}
            min={10} max={1000} step={10}
            onChange={(v) => setParam("min_grain_px", v)}
          />
          <ParamSlider
            label="CLAHE contrast" unit="×"
            value={localParams.clahe_clip ?? 2.0}
            min={1.0} max={5.0} step={0.5}
            onChange={(v) => setParam("clahe_clip", v)}
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          {/* Auto-detect seeds */}
          <Button
            size="sm"
            disabled={!hasFile || isReprocessing || isTraining}
            onClick={() => {
              onFetchSeeds(localSeedSens);
              setLocalParams(p => ({ ...p, seed_sensitivity: localSeedSens }));
            }}
            className="bg-[#00ff88]/10 hover:bg-[#00ff88]/20 text-[#00ff88] border border-[#00ff88]/20 font-mono text-xs"
          >
            Auto-detect Seeds
          </Button>

          {/* Edit seeds */}
          <Button
            size="sm"
            disabled={!hasFile || isTraining}
            onClick={() => setEditingSeeds(true)}
            className="bg-white/5 hover:bg-white/10 text-muted-foreground border border-white/10 font-mono text-xs"
          >
            {seeds.length > 0 ? `Edit Seeds (${seeds.length})` : "Place Seeds"}
          </Button>

          {/* Calibrate from annotation */}
          <Button
            size="sm"
            disabled={!hasFile || isTraining || isReprocessing}
            onClick={() => setAnnotating(true)}
            className="bg-[#7c3aed]/10 hover:bg-[#7c3aed]/20 text-[#7c3aed] border border-[#7c3aed]/20 font-mono text-xs"
          >
            {isTraining ? "Calibrating…" : "Calibrate"}
          </Button>

          {/* Apply & re-segment */}
          <Button
            size="sm"
            disabled={!hasFile || isReprocessing || isTraining || (!dirty && seeds.length === 0)}
            onClick={() => {
              const p = { ...localParams, seed_sensitivity: localSeedSens };
              onReprocess(p, seeds);
              setDirty(false);
            }}
            className="bg-[#00ff88]/10 hover:bg-[#00ff88]/20 text-[#00ff88] border border-[#00ff88]/20 font-mono text-xs"
          >
            {isReprocessing ? "Segmenting…" : "Apply"}
          </Button>
        </div>

        {!hasFile && (
          <p className="text-[9px] font-mono text-muted-foreground/40">
            Upload an image to begin grain analysis.
          </p>
        )}
        {hasFile && seeds.length === 0 && (
          <p className="text-[9px] font-mono text-muted-foreground/40 leading-relaxed">
            <span className="text-[#00ff88]/60">Auto-detect Seeds</span> finds grain centers automatically.
            Then <span className="text-[#00ff88]/60">Apply</span> segments from those seeds.
          </p>
        )}
      </div>

      {/* Overlay canvas */}
      <div className="flex-1 min-h-[100px] rounded overflow-hidden">
        <GrainOverlay contours={contours} />
      </div>
    </div>
  );
}

// ── Chemical synthesis view ───────────────────────────────────────────────────
function ChemSynthView({ materials, onLookup }: { materials: MaterialPhase[] | null; onLookup: (p: MaterialPhase[]) => void }) {
  const [formula, setFormula] = useState("Fe2MnAl");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLookup = async () => {
    setLoading(true); setError(null);
    try { onLookup(await lookupMaterials(formula)); }
    catch (e) { setError(e instanceof Error ? e.message : "Lookup failed"); }
    finally { setLoading(false); }
  };

  return (
    <div className="flex flex-col gap-3 h-full">
      <div className="flex gap-2">
        <input
          value={formula} onChange={(e) => setFormula(e.target.value)}
          placeholder="e.g. Fe2MnAl"
          className="flex-1 bg-background border border-white/10 rounded px-3 py-1.5 text-xs font-mono focus:outline-none focus:border-[#00ff88]/40"
        />
        <Button
          onClick={handleLookup} disabled={loading || !formula} size="sm"
          className="bg-[#7c3aed] hover:bg-[#7c3aed]/90 text-white font-mono text-xs"
        >
          {loading ? "…" : "Query MP"}
        </Button>
      </div>

      {error && <p className="text-xs text-destructive font-mono">{error}</p>}

      {materials && materials.length > 0 ? (
        <div className="overflow-auto flex-1">
          <Table>
            <TableHeader>
              <TableRow className="border-white/5">
                {["Formula","ΔHf (eV/at)","Ehull","SG","Stable"].map(h => (
                  <TableHead key={h} className="text-[10px] font-mono text-muted-foreground uppercase">{h}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {materials.map((m) => (
                <TableRow key={m.material_id} className="border-white/5 hover:bg-white/[0.02]">
                  <TableCell className="font-mono text-xs text-[#00ff88]">{m.formula}</TableCell>
                  <TableCell className="font-mono text-xs">{m.formation_energy_per_atom.toFixed(3)}</TableCell>
                  <TableCell className="font-mono text-xs">
                    <span className={m.energy_above_hull < 0.05 ? "text-[#00ff88]" : "text-amber-400"}>
                      {m.energy_above_hull.toFixed(4)}
                    </span>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{m.spacegroup ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={m.is_stable ? "default" : "secondary"}
                      className={`text-[10px] ${m.is_stable ? "bg-[#00ff88]/20 text-[#00ff88] border-[#00ff88]/30" : "bg-white/5 text-muted-foreground"}`}>
                      {m.is_stable ? "stable" : "metastable"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground font-mono opacity-40">
          {materials === null ? "Enter formula and query Materials Project" : "No phases found"}
        </div>
      )}
    </div>
  );
}

// ── Root ──────────────────────────────────────────────────────────────────────
export function AnalysisPanel({
  contours, materials, onMaterialsLookup,
  grainParams, seeds, seedSensitivity,
  onReprocessGrains, onFetchSeeds, onAddSeed, onRemoveSeeds, onAnnotateGrain,
  isReprocessing, isTraining, hasFile, originalUrl,
}: Props) {
  return (
    <div className="og-card p-4 flex flex-col gap-3 h-full">
      <div className="flex items-center justify-between">
        <span className="text-xs font-mono text-muted-foreground uppercase tracking-widest">Analysis</span>
        {contours && (
          <span className="text-[10px] font-mono text-[#00ff88]/60">
            {contours.grain_count} grains detected
          </span>
        )}
      </div>

      <Tabs defaultValue="mask" className="flex-1 flex flex-col">
        <TabsList className="bg-white/5 border border-white/5 w-fit">
          <TabsTrigger value="mask" className="text-xs font-mono data-[state=active]:bg-[#00ff88]/10 data-[state=active]:text-[#00ff88]">
            Visual Mask
          </TabsTrigger>
          <TabsTrigger value="chem" className="text-xs font-mono data-[state=active]:bg-[#7c3aed]/10 data-[state=active]:text-[#7c3aed]">
            Chemical Synthesis
          </TabsTrigger>
        </TabsList>

        <TabsContent value="mask" className="flex-1 mt-3 min-h-[200px]">
          <VisualMaskTab
            contours={contours}
            params={grainParams}
            seeds={seeds}
            seedSensitivity={seedSensitivity}
            onReprocess={onReprocessGrains}
            onFetchSeeds={onFetchSeeds}
            onAddSeed={onAddSeed}
            onRemoveSeeds={onRemoveSeeds}
            onAnnotateGrain={onAnnotateGrain}
            isReprocessing={isReprocessing}
            isTraining={isTraining}
            hasFile={hasFile}
            originalUrl={originalUrl}
          />
        </TabsContent>

        <TabsContent value="chem" className="flex-1 mt-3 min-h-[200px]">
          <ChemSynthView materials={materials} onLookup={onMaterialsLookup} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
