"use client";
import { useRef, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

interface Props {
  onFileReady: (file: File, previewUrl: string) => void;
  onAnalyze: () => void;
  processedUrl: string | null;
  isProcessing: boolean;
}

export function UploadPanel({ onFileReady, onAnalyze, processedUrl, isProcessing }: Props) {
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    (file: File) => {
      if (!file.type.startsWith("image/")) return;
      const url = URL.createObjectURL(file);
      setOriginalUrl(url);
      onFileReady(file, url);
    },
    [onFileReady]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  return (
    <div className="og-card p-4 flex flex-col gap-4 h-full">
      <div className="flex items-center justify-between">
        <span className="text-xs font-mono text-muted-foreground uppercase tracking-widest">
          SEM Input
        </span>
        <Dialog>
          <DialogTrigger className="text-[10px] font-mono text-muted-foreground/40 hover:text-muted-foreground transition-colors bg-transparent border-0 cursor-pointer">
            settings
          </DialogTrigger>
          <DialogContent className="bg-card border-white/10 max-w-sm">
            <DialogHeader>
              <DialogTitle className="font-mono text-sm">Upload Settings</DialogTitle>
            </DialogHeader>
            <div className="text-xs text-muted-foreground space-y-2 font-mono">
              <div className="flex justify-between"><span>Magnification</span><span className="text-[#00ff88]">Auto-detect</span></div>
              <div className="flex justify-between"><span>Scale calibration</span><span className="text-[#00ff88]">From scalebar</span></div>
              <div className="flex justify-between"><span>Preprocessing</span><span className="text-[#00ff88]">Normalize + GaussBlur</span></div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`
          relative flex flex-col items-center justify-center
          rounded-lg border-2 border-dashed cursor-pointer
          transition-all duration-200 min-h-[160px]
          ${dragOver
            ? "border-[#00ff88] bg-[#00ff88]/5"
            : "border-white/10 hover:border-[#00ff88]/40 hover:bg-white/[0.02]"
          }
        `}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
        />
        {originalUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={originalUrl} alt="Original SEM" className="max-h-[140px] object-contain rounded" />
        ) : (
          <div className="flex flex-col items-center gap-2 text-center px-4">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-muted-foreground/40">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <p className="text-xs text-muted-foreground">Drop SEM micrograph or click to browse</p>
            <p className="text-[10px] text-muted-foreground/40 font-mono">PNG · TIFF · JPG</p>
          </div>
        )}
      </div>

      {/* Preprocessed preview */}
      {processedUrl && (
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-mono text-muted-foreground/50 uppercase tracking-widest">
            Preprocessed ↓
          </span>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={processedUrl} alt="Preprocessed" className="rounded-lg border border-[#00ff88]/10 max-h-[120px] object-contain" />
        </div>
      )}

      <Button
        onClick={onAnalyze}
        disabled={!originalUrl || isProcessing}
        className="mt-auto w-full bg-[#00ff88] hover:bg-[#00ff88]/90 text-black font-mono text-xs tracking-widest uppercase disabled:opacity-30"
      >
        {isProcessing ? (
          <span className="flex items-center gap-2">
            <span className="og-pulse inline-block w-2 h-2 rounded-full bg-black" />
            Processing…
          </span>
        ) : "Run Analysis"}
      </Button>
    </div>
  );
}
