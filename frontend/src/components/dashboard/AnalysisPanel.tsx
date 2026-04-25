"use client";
import { useEffect, useRef, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ContourData, MaterialPhase } from "@/lib/api";
import { lookupMaterials } from "@/lib/api";

interface Props {
  contours: ContourData | null;
  materials: MaterialPhase[] | null;
  onMaterialsLookup: (phases: MaterialPhase[]) => void;
}

function GrainCanvas({ contours }: { contours: ContourData | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!contours || !canvasRef.current) return;
    const img = new Image();
    img.onload = () => {
      const canvas = canvasRef.current!;
      canvas.width = img.width;
      canvas.height = img.height;
      canvas.getContext("2d")!.drawImage(img, 0, 0);
    };
    img.src = `data:image/png;base64,${contours.overlay_base64}`;
  }, [contours]);

  if (!contours) return (
    <div className="flex items-center justify-center h-full text-xs text-muted-foreground font-mono opacity-40">
      Run analysis to generate grain mask
    </div>
  );

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full object-contain rounded"
      style={{ imageRendering: "pixelated" }}
    />
  );
}

function ChemSynthView({ materials, onLookup }: { materials: MaterialPhase[] | null; onLookup: (phases: MaterialPhase[]) => void }) {
  const [formula, setFormula] = useState("Fe2MnAl");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLookup = async () => {
    setLoading(true);
    setError(null);
    try {
      const phases = await lookupMaterials(formula);
      onLookup(phases);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lookup failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 h-full">
      <div className="flex gap-2">
        <input
          value={formula}
          onChange={(e) => setFormula(e.target.value)}
          placeholder="e.g. Fe2MnAl"
          className="flex-1 bg-background border border-white/10 rounded px-3 py-1.5 text-xs font-mono focus:outline-none focus:border-[#00ff88]/40"
        />
        <Button
          onClick={handleLookup}
          disabled={loading || !formula}
          size="sm"
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
                <TableHead className="text-[10px] font-mono text-muted-foreground uppercase">Formula</TableHead>
                <TableHead className="text-[10px] font-mono text-muted-foreground uppercase">ΔHf (eV/at)</TableHead>
                <TableHead className="text-[10px] font-mono text-muted-foreground uppercase">Ehull</TableHead>
                <TableHead className="text-[10px] font-mono text-muted-foreground uppercase">SG</TableHead>
                <TableHead className="text-[10px] font-mono text-muted-foreground uppercase">Stable</TableHead>
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
                    <Badge variant={m.is_stable ? "default" : "secondary"} className={`text-[10px] ${m.is_stable ? "bg-[#00ff88]/20 text-[#00ff88] border-[#00ff88]/30" : "bg-white/5 text-muted-foreground"}`}>
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

export function AnalysisPanel({ contours, materials, onMaterialsLookup }: Props) {
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
          <GrainCanvas contours={contours} />
        </TabsContent>

        <TabsContent value="chem" className="flex-1 mt-3 min-h-[200px]">
          <ChemSynthView materials={materials} onLookup={onMaterialsLookup} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
