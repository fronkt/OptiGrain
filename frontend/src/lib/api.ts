const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export interface AnalysisResult {
  average_grain_size_microns: number;
  confidence_score: number;
  detected_defects: string[];
  astm_grain_number: number;
  grain_count: number;
}

export interface ContourData {
  overlay_base64: string;
  grain_count: number;
  average_area_px: number;
  average_diameter_px: number;
  contours: { id: number; area_px: number; centroid: [number, number] }[];
}

export interface MaterialPhase {
  material_id: string;
  formula: string;
  formation_energy_per_atom: number;
  energy_above_hull: number;
  spacegroup: string | null;
  is_stable: boolean;
}

async function post(path: string, file: File): Promise<Response> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(`${BASE}${path}`, { method: "POST", body: fd });
  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    throw new Error(detail || res.statusText);
  }
  return res;
}

export async function uploadImage(file: File): Promise<Blob> {
  return (await post("/api/upload", file)).blob();
}

export async function analyzeImage(file: File): Promise<AnalysisResult> {
  return (await post("/api/analyze", file)).json();
}

export async function getGrainContours(file: File): Promise<ContourData> {
  return (await post("/api/grain-contours", file)).json();
}

export async function lookupMaterials(formula: string): Promise<MaterialPhase[]> {
  const res = await fetch(`${BASE}/api/materials-lookup?formula=${encodeURIComponent(formula)}`);
  if (!res.ok) throw new Error(`Materials lookup failed: ${res.statusText}`);
  return res.json();
}
