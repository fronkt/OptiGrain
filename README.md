# OptiGrain SaaS

![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![Python](https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green.svg?style=for-the-badge)

Welcome to **OptiGrain SaaS**. This repository houses the complete source code for the OptiGrain platform, featuring a robust Python-based backend and a modern TypeScript frontend.

*OptiGrain is an AI-powered SaaS platform designed to optimize grain yield analytics for modern agriculture. OptiGrain is a data-optimization tool managing fine-grained data infrastructure.*

## What
Materials informatics SaaS for electron micrograph analysis. Analyzes SEM/optical
metallographs: segments grain boundaries, computes ASTM E112 grain size numbers,
detects defects, and cross-references detected phases with thermodynamic databases.

## Stack
- **Frontend**: Next.js 15 (App Router), TypeScript, Tailwind CSS, Shadcn UI
- **Backend**: FastAPI (Python), OpenCV, VLM via OpenRouter (Qwen-2.5-VL-72B)
- **Materials DB**: Materials Project API (mp-api), JARVIS-DFT
- **MCP**: Materials Project MCP server for real-time phase stability queries

## API Surface (backend on :8000)
- `POST /api/upload`   → preprocessed PNG (grayscale+normalize+blur)
- `POST /api/analyze`  → { average_grain_size_microns, confidence_score, detected_defects, astm_grain_number }
- `POST /api/grain-contours` → contour overlay PNG + JSON contour data
- `GET  /api/materials-lookup?formula=Fe2MnAl` → phase candidates from Materials Project

## UI Rules
- Always dark mode (`bg-[#0a0a0f]`, accent: `#00ff88` / `#7c3aed`)
- Layout: 12-col bento-box CSS grid with `gap-3`
- Components: always use Shadcn UI — Dialog, Tabs, Table, Badge, Card, Progress
- Micro-interactions: subtle border glow on hover (`shadow-[0_0_12px_rgba(0,255,136,0.2)]`)
- Font: `font-mono` for data values, `font-sans` for labels
- Status indicators: pulsing dot for processing, green badge for success

## ASTM E112 Formula
G (grain number) = -6.6457 × log₁₀(d_mm) − 1.5
where d_mm = average grain diameter in millimeters.
Alternatively: G = -6.6457 × log₁₀(N̄_mean_area_mm2) + constant.

## Key Domain Terms
- SEM: Scanning Electron Microscopy
- Grain size: average diameter of polycrystalline grains
- ASTM E112: standard test method for average grain size
- Formation energy (eH/atom): thermodynamic stability measure
- e_hull (eV/atom): distance to convex hull — 0 = stable, >0.1 = unstable
- Bravais lattice: crystal structure classification
- MatSAM: segment-anything adapted for materials microstructures

## Environment Variables (backend/.env)
```
VLM_API_KEY=<openrouter key>
VLM_API_URL=https://openrouter.ai/api/v1/chat/completions
VLM_MODEL=qwen/qwen2.5-vl-72b-instruct:free
MP_API_KEY=<materials project key>
```
