# Task: Marker-controlled gradient watershed (seed & grow)

## Plan
- [x] Read all relevant files
- [x] grain_analysis.py: add `generate_auto_seeds()` + `segment_from_seeds()`
- [x] main.py: add `/api/grain-seeds`, update `/api/grain-contours` for seeds_json
- [x] api.ts: add Seed type, update ContourData/GrainParams, add getGrainSeeds()
- [x] BentoDashboard.tsx: add seeds/seedSensitivity state + callbacks
- [x] AnalysisPanel.tsx: add SeedCanvas, seed controls in VisualMaskTab

## Review
- Completed: 2026-04-25
- What worked: h_maxima from skimage.morphology perfectly matches MATLAB imextendedmax; watershed from seeds with Sobel gradient terrain gives clean boundary detection; test image 512×512 at s=50 → 7 seeds → 7 grains
- What changed from plan: grain-template endpoint now returns full segmentation result along with calibration params

## Review
<!-- Fill in after completion -->
