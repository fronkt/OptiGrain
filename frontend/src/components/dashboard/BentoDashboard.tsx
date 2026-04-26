"use client";
import { useState, useCallback } from "react";
import { UploadPanel } from "./UploadPanel";
import { AnalysisPanel } from "./AnalysisPanel";
import { StatsPanel } from "./StatsPanel";
import { MetricsCard } from "./MetricsCard";
import {
  uploadImage, analyzeImage, getGrainContours, getGrainSeeds, trainGrainTemplate,
} from "@/lib/api";
import type { AnalysisResult, ContourData, MaterialPhase, GrainParams, Seed } from "@/lib/api";

type Status = "idle" | "uploading" | "analyzing" | "contouring" | "training" | "done" | "error";

export function BentoDashboard() {
  const [file, setFile] = useState<File | null>(null);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [processedUrl, setProcessedUrl] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [contours, setContours] = useState<ContourData | null>(null);
  const [materials, setMaterials] = useState<MaterialPhase[] | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState<number | null>(null);

  const [seeds, setSeeds] = useState<Seed[]>([]);
  const [seedSensitivity, setSeedSensitivity] = useState(50);

  const [grainParams, setGrainParams] = useState<GrainParams>({
    seed_sensitivity: 50,
    min_grain_px: 100,
    clahe_clip: 2.0,
  });

  const runContours = useCallback(async (f: File, params: GrainParams, s: Seed[]) => {
    setStatus("contouring");
    try {
      const result = await getGrainContours(f, { ...params, seeds: s });
      setContours(result);
      if (result.seeds) setSeeds(result.seeds);
    } catch {
      // contours are optional — don't fail the whole pipeline
    }
  }, []);

  const onFileReady = useCallback(async (f: File) => {
    setFile(f);
    setOriginalUrl(URL.createObjectURL(f));
    setAnalysis(null);
    setContours(null);
    setMaterials(null);
    setError(null);
    setProcessedUrl(null);
    setSeeds([]);
    setStatus("uploading");
    try {
      const blob = await uploadImage(f);
      setProcessedUrl(URL.createObjectURL(blob));
      setStatus("idle");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
      setStatus("error");
    }
  }, []);

  const onAnalyze = useCallback(async () => {
    if (!file) return;
    setError(null);
    const start = Date.now();

    setStatus("analyzing");
    try {
      setAnalysis(await analyzeImage(file));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analysis failed");
      setStatus("error");
      return;
    }

    await runContours(file, grainParams, seeds);
    setElapsed(Date.now() - start);
    setStatus("done");
  }, [file, grainParams, seeds, runContours]);

  const onReprocessGrains = useCallback(async (params: GrainParams, s: Seed[]) => {
    if (!file) return;
    setGrainParams(params);
    await runContours(file, params, s);
    setStatus("done");
  }, [file, runContours]);

  const onFetchSeeds = useCallback(async (sensitivity: number) => {
    if (!file) return;
    setSeedSensitivity(sensitivity);
    setError(null);
    try {
      const newSeeds = await getGrainSeeds(file, sensitivity, grainParams.clahe_clip ?? 2.0);
      setSeeds(newSeeds);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Seed detection failed");
    }
  }, [file, grainParams.clahe_clip]);

  const onAddSeed = useCallback((x: number, y: number) => {
    setSeeds(s => [...s, { x: Math.round(x * 10000) / 10000, y: Math.round(y * 10000) / 10000 }]);
  }, []);

  const onRemoveSeeds = useCallback((x0: number, y0: number, x1: number, y1: number) => {
    setSeeds(s => s.filter(sd => !(sd.x >= x0 && sd.x <= x1 && sd.y >= y0 && sd.y <= y1)));
  }, []);

  const onAnnotateGrain = useCallback(async (x0: number, y0: number, x1: number, y1: number) => {
    if (!file) return;
    setError(null);
    setStatus("training");
    try {
      const result = await trainGrainTemplate(file, x0, y0, x1, y1);
      const newParams: GrainParams = {
        seed_sensitivity: result.seed_sensitivity,
        min_grain_px: result.min_grain_px,
        clahe_clip: result.clahe_clip,
      };
      setGrainParams(newParams);
      setSeedSensitivity(result.seed_sensitivity);
      if (result.seeds) setSeeds(result.seeds);
      if (result.overlay_base64) {
        setContours({
          overlay_base64: result.overlay_base64,
          grain_count: result.grain_count ?? 0,
          average_area_px: result.average_area_px ?? 0,
          average_diameter_px: result.average_diameter_px ?? 0,
          contours: result.contours ?? [],
          seeds: result.seeds,
        });
      } else {
        await runContours(file, newParams, result.seeds ?? []);
      }
      setStatus("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Calibration failed");
      setStatus("error");
    }
  }, [file, runContours]);

  return (
    <div className="grid grid-cols-12 gap-3 p-4 w-full max-w-[1600px] mx-auto">
      {/* Upload (5 cols) */}
      <div className="col-span-12 lg:col-span-5 min-h-[380px] relative">
        <UploadPanel
          onFileReady={onFileReady}
          onAnalyze={onAnalyze}
          processedUrl={processedUrl}
          isProcessing={status === "uploading" || status === "analyzing" || status === "contouring" || status === "training"}
        />
      </div>

      {/* Analysis tabs (7 cols) */}
      <div className="col-span-12 lg:col-span-7 min-h-[380px]">
        <AnalysisPanel
          contours={contours}
          materials={materials}
          onMaterialsLookup={setMaterials}
          grainParams={grainParams}
          seeds={seeds}
          seedSensitivity={seedSensitivity}
          onReprocessGrains={onReprocessGrains}
          onFetchSeeds={onFetchSeeds}
          onAddSeed={onAddSeed}
          onRemoveSeeds={onRemoveSeeds}
          onAnnotateGrain={onAnnotateGrain}
          isReprocessing={status === "contouring"}
          isTraining={status === "training"}
          hasFile={!!file}
          originalUrl={originalUrl}
        />
      </div>

      {/* Stats table (8 cols) */}
      <div className="col-span-12 lg:col-span-8">
        <StatsPanel analysis={analysis} />
      </div>

      {/* Metrics card (4 cols) */}
      <div className="col-span-12 lg:col-span-4 relative overflow-hidden">
        <MetricsCard status={status} analysis={analysis} elapsed={elapsed} error={error} />
      </div>
    </div>
  );
}
