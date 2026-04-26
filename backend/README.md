# FastAPI OpenCV Backend

This backend exposes:

- an upload API that preprocesses and returns the processed PNG image
- an analysis API that preprocesses the image and sends it to a VLM for structured metallurgy analysis JSON

## What `/api/upload` does

1. Convert uploaded image to grayscale
2. Normalize contrast (`cv2.normalize` with min-max scaling)
3. Apply mild Gaussian blur (`5x5`) to reduce small noise/scratch artifacts
4. Return processed image bytes (`image/png`)

## Run locally

```powershell
cd C:\Users\frank\backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

## Run with workers (for heavier analyze traffic)

Use this when VLM calls are slow and you want concurrent request handling.  
Note: `--workers` cannot be combined with `--reload`.

```powershell
cd C:\Users\frank\backend
.\.venv\Scripts\Activate.ps1
uvicorn main:app --host 0.0.0.0 --port 8000 --workers 2
```

## Endpoint

- `POST http://localhost:8000/api/upload`
- Form field: `file` (multipart/form-data image)

## VLM configuration

Create or update `backend/.env`:

```env
VLM_API_KEY=your_vlm_api_key_here
VLM_API_URL=https://openrouter.ai/api/v1/chat/completions
VLM_MODEL=qwen/qwen2.5-vl-72b-instruct:free
OPENROUTER_HTTP_REFERER=http://localhost:3000
OPENROUTER_X_TITLE=OptiGrain AI
```

`/api/analyze` uses these env vars to call a provider-hosted open-source VLM via an OpenAI-compatible Chat Completions API.

## Analysis endpoint

- `POST http://localhost:8000/api/analyze`
- Form field: `file` (multipart/form-data image)
- Pipeline:
  1. preprocess image (grayscale -> normalize contrast -> mild Gaussian blur)
  2. send preprocessed image to VLM with metallurgist system prompt
  3. enforce strict structured output

Expected JSON response:

```json
{
  "average_grain_size_microns": 18.4,
  "confidence_score": 0.86,
  "detected_defects": ["minor scratch", "isolated inclusion"]
}
```

## Next.js example call

```ts
const formData = new FormData();
formData.append("file", selectedFile);

const res = await fetch("http://localhost:8000/api/upload", {
  method: "POST",
  body: formData,
});

if (!res.ok) {
  throw new Error("Upload failed");
}

const blob = await res.blob();
const processedPreviewUrl = URL.createObjectURL(blob);
// Render processedPreviewUrl beside the original image
```

## Next.js analyze call example

```ts
const formData = new FormData();
formData.append("file", selectedFile);

const res = await fetch("http://localhost:8000/api/analyze", {
  method: "POST",
  body: formData,
});

if (!res.ok) {
  throw new Error("Analyze failed");
}

const analysis = await res.json();
// analysis.average_grain_size_microns
// analysis.confidence_score
// analysis.detected_defects
```
