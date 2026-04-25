"use client";
import { useState, useCallback } from "react";
import { UploadPanel } from "./UploadPanel";
import { AnalysisPanel } from "./AnalysisPanel";
import { StatsPanel } from "./StatsPanel";
import { MetricsCard } from "./MetricsCard";
import { uploadImage, analyzeImage, getGrainContours } from "@/lib/api";
import type { AnalysisResult, ContourData, MaterialPhase } from "@/lib/api";

type Status = "idle" | "uploading" | "analyzing" | "contouring" | "done" | "error";

export function BentoDashboard() {
  const [file, setFile] = useState<File | null>(null);
  const [processedUrl, setProcessedUrl] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [contours, setContours] = useState<ContourData | null>(null);
  const [materials, setMaterials] = useState<MaterialPhase[] | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState<number | null>(null);

  const onFileReady = useCallback(async (f: File) => {
    setFile(f);
    setAnalysis(null);
    setContours(null);
    setMaterials(null);
    setError(null);
    setProcessedUrl(null);
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
      const result = await analyzeImage(file);
      setAnalysis(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analysis failed");
      setStatus("error");
      return;
    }

    setStatus("contouring");
    try {
      const ctrs = await getGrainContours(file);
      setContours(ctrs);
    } catch {
      // Contours are optional — don't fail the whole pipeline
    }

    setElapsed(Date.now() - start);
    setStatus("done");
  }, [file]);

  return (
    <div className="grid grid-cols-12 gap-3 p-4 w-full max-w-[1600px] mx-auto">
      {/* Upload (5 cols) */}
      <div className="col-span-12 lg:col-span-5 min-h-[380px] relative">
        <UploadPanel
          onFileReady={onFileReady}
          onAnalyze={onAnalyze}
          processedUrl={processedUrl}
          isProcessing={status === "uploading" || status === "analyzing" || status === "contouring"}
        />
      </div>

      {/* Analysis tabs (7 cols) */}
      <div className="col-span-12 lg:col-span-7 min-h-[380px]">
        <AnalysisPanel
          contours={contours}
          materials={materials}
          onMaterialsLookup={setMaterials}
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
