const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export interface AnalysisResult {
  average_grain_size_microns: number;
  confidence_score: number;
  detected_defects: string[];
  astm_grain_number: number;
  grain_count: number;
}

export interface Seed {
  x: number;
  y: number;
}

export interface ContourData {
  overlay_base64: string;
  grain_count: number;
  average_area_px: number;
  average_diameter_px: number;
  contours: { id: number; area_px: number; centroid: [number, number] }[];
  seeds?: Seed[];
}

export interface MaterialPhase {
  material_id: string;
  formula: string;
  formation_energy_per_atom: number;
  energy_above_hull: number;
  spacegroup: string | null;
  is_stable: boolean;
}

export interface GrainParams {
  seed_sensitivity?: number;  // 1–99
  min_grain_px?: number;      // 10–2000
  clahe_clip?: number;        // 1.0–5.0
  seeds?: Seed[];
  use_ml?: boolean;           // legacy
}

export interface GrainTemplateResult {
  seed_sensitivity: number;
  min_grain_px: number;
  clahe_clip: number;
  use_ml: boolean;
  estimated_grain_diameter_px: number;
  // Also includes full ContourData fields
  overlay_base64?: string;
  grain_count?: number;
  average_area_px?: number;
  average_diameter_px?: number;
  contours?: ContourData["contours"];
  seeds?: Seed[];
}

async function postFile(path: string, fd: FormData): Promise<Response> {
  const res = await fetch(`${BASE}${path}`, { method: "POST", body: fd });
  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    throw new Error(detail || res.statusText);
  }
  return res;
}

export async function uploadImage(file: File): Promise<Blob> {
  const fd = new FormData();
  fd.append("file", file);
  return (await postFile("/api/upload", fd)).blob();
}

export async function analyzeImage(file: File): Promise<AnalysisResult> {
  const fd = new FormData();
  fd.append("file", file);
  return (await postFile("/api/analyze", fd)).json();
}

export async function getGrainSeeds(file: File, sensitivity = 50, clahe_clip = 2.0): Promise<Seed[]> {
  const fd = new FormData();
  fd.append("file", file);
  const qs = new URLSearchParams({ sensitivity: String(sensitivity), clahe_clip: String(clahe_clip) });
  const data = await (await postFile(`/api/grain-seeds?${qs}`, fd)).json();
  return data.seeds ?? [];
}

export async function getGrainContours(file: File, params: GrainParams = {}): Promise<ContourData> {
  const qs = new URLSearchParams();
  if (params.seed_sensitivity !== undefined) qs.set("seed_sensitivity", String(params.seed_sensitivity));
  if (params.min_grain_px    !== undefined) qs.set("min_grain_px",     String(params.min_grain_px));
  if (params.clahe_clip      !== undefined) qs.set("clahe_clip",       String(params.clahe_clip));

  const fd = new FormData();
  fd.append("file", file);
  fd.append("seeds_json", JSON.stringify(params.seeds ?? []));

  const path = `/api/grain-contours${qs.toString() ? "?" + qs.toString() : ""}`;
  return (await postFile(path, fd)).json();
}

export async function trainGrainTemplate(
  file: File,
  x0: number, y0: number, x1: number, y1: number,
): Promise<GrainTemplateResult> {
  const fd = new FormData();
  fd.append("file", file);
  const qs = new URLSearchParams({
    x0: x0.toFixed(6), y0: y0.toFixed(6),
    x1: x1.toFixed(6), y1: y1.toFixed(6),
  });
  return (await postFile(`/api/grain-template?${qs}`, fd)).json();
}

export async function lookupMaterials(formula: string): Promise<MaterialPhase[]> {
  const res = await fetch(`${BASE}/api/materials-lookup?formula=${encodeURIComponent(formula)}`);
  if (!res.ok) throw new Error(`Materials lookup failed: ${res.statusText}`);
  return res.json();
}
