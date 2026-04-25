from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, ValidationError
from dotenv import load_dotenv
import base64
import cv2
import httpx
import numpy as np
import json
import logging
import os
from pathlib import Path

from grain_analysis import astm_grain_number, segment_grains
from materials_lookup import lookup_phases


ENV_PATH = Path(__file__).with_name(".env")
load_dotenv(dotenv_path=ENV_PATH)
logging.basicConfig(level=logging.DEBUG)


app = FastAPI(title="Image Processing Backend")

# Keep CORS permissive for local frontend development.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class AnalyzeResult(BaseModel):
    average_grain_size_microns: float
    confidence_score: float
    detected_defects: list[str]
    astm_grain_number: float = 0.0
    grain_count: int = 0


def decode_uploaded_image(image_bytes: bytes) -> np.ndarray:
    np_data = np.frombuffer(image_bytes, dtype=np.uint8)
    image = cv2.imdecode(np_data, cv2.IMREAD_COLOR)
    if image is None:
        raise HTTPException(status_code=400, detail="Could not decode the uploaded image.")
    return image


def preprocess_image(image: np.ndarray) -> np.ndarray:
    # Remove lower overlay regions (scale bars/text) before enhancement.
    height = image.shape[0]
    cropped_height = max(1, int(height * 0.85))
    image = image[:cropped_height, :]

    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    normalized = cv2.normalize(gray, None, alpha=0, beta=255, norm_type=cv2.NORM_MINMAX)
    return cv2.GaussianBlur(normalized, (5, 5), sigmaX=0)


def encode_png(image: np.ndarray) -> bytes:
    ok, encoded = cv2.imencode(".png", image)
    if not ok:
        raise HTTPException(status_code=500, detail="Failed to encode processed image.")
    return encoded.tobytes()


def extract_first_json_object(text: str) -> str:
    start_idx = text.find("{")
    if start_idx == -1:
        raise ValueError("No JSON object found in VLM response.")

    in_string = False
    escape_next = False
    depth = 0

    for idx in range(start_idx, len(text)):
        char = text[idx]

        if escape_next:
            escape_next = False
            continue
        if char == "\\" and in_string:
            escape_next = True
            continue
        if char == '"':
            in_string = not in_string
            continue
        if in_string:
            continue

        if char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                return text[start_idx : idx + 1]

    raise ValueError("Unterminated JSON object in VLM response.")


def parse_strict_json(content: str) -> AnalyzeResult:
    cleaned = content.strip()

    # Strip common markdown fences anywhere in the response.
    cleaned = cleaned.replace("```json", "").replace("```JSON", "").replace("```", "").strip()
    cleaned = extract_first_json_object(cleaned)

    try:
        data = json.loads(cleaned)
        return AnalyzeResult.model_validate(data)
    except (json.JSONDecodeError, ValidationError) as exc:
        raise ValueError(f"VLM response was not valid strict JSON for analysis schema: {exc}") from exc


@app.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/upload")
async def upload_image(file: UploadFile = File(...)) -> Response:
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Please upload a valid image file.")

    image_bytes = await file.read()
    if not image_bytes:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    image = decode_uploaded_image(image_bytes)
    polished = preprocess_image(image)
    return Response(content=encode_png(polished), media_type="image/png")


@app.post("/api/analyze")
async def analyze_image(file: UploadFile = File(...)) -> JSONResponse:
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Please upload a valid image file.")

    image_bytes = await file.read()
    if not image_bytes:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")
    print(
        f"[analyze] Image received: filename={file.filename}, content_type={file.content_type}, bytes={len(image_bytes)}",
        flush=True,
    )

    api_key = os.getenv("VLM_API_KEY", "").strip()
    api_url = os.getenv("VLM_API_URL", "https://openrouter.ai/api/v1/chat/completions").strip()
    model = os.getenv("VLM_MODEL", "qwen/qwen2.5-vl-72b-instruct:free").strip()
    app_referer = os.getenv("OPENROUTER_HTTP_REFERER", "http://localhost:3000").strip()
    app_title = os.getenv("OPENROUTER_X_TITLE", "OptiGrain AI").strip()

    if not api_key:
        raise HTTPException(
            status_code=500,
            detail=(
                "VLM_API_KEY is not set. Add it in backend/.env before using /api/analyze. "
                f"Resolved env file path: {ENV_PATH}"
            ),
        )

    image = decode_uploaded_image(image_bytes)
    polished = preprocess_image(image)
    jpeg_ok, processed_jpg = cv2.imencode(".jpg", polished)
    if not jpeg_ok:
        raise HTTPException(status_code=500, detail="Failed to encode processed image for VLM.")
    print(
        f"[analyze] OpenCV preprocessing complete: input_shape={image.shape}, processed_shape={polished.shape}",
        flush=True,
    )
    b64_image = base64.b64encode(processed_jpg.tobytes()).decode("ascii")
    data_uri = f"data:image/jpeg;base64,{b64_image}"

    system_prompt = (
        "You are an expert metallurgist specializing in microstructure analysis. "
        "Your task is to analyze the provided preprocessed metallographic image. "
        "Step 1: identify and segment grain boundaries. "
        "Step 2: estimate and calculate average grain size in microns. "
        "Step 3: identify detected defects such as scratches, pits, inclusions, cracks, or porosity. "
        "Return ONLY a strict JSON object with exactly these keys: "
        "average_grain_size_microns (number), confidence_score (number 0 to 1), detected_defects (array of strings). "
        "Do not include markdown, code fences, comments, or extra keys."
    )

    payload = {
        "model": model,
        "temperature": 0.1,
        "response_format": {
            "type": "json_schema",
            "json_schema": {
                "name": "metallurgy_analysis",
                "strict": True,
                "schema": {
                    "type": "object",
                    "properties": {
                        "average_grain_size_microns": {"type": "number"},
                        "confidence_score": {"type": "number"},
                        "detected_defects": {
                            "type": "array",
                            "items": {"type": "string"},
                        },
                    },
                    "required": [
                        "average_grain_size_microns",
                        "confidence_score",
                        "detected_defects",
                    ],
                    "additionalProperties": False,
                },
            },
        },
        "messages": [
            {"role": "system", "content": system_prompt},
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": (
                            "Analyze this preprocessed metallographic image and return strict JSON only."
                        ),
                    },
                    {
                        "type": "image_url",
                        "image_url": {"url": data_uri},
                    },
                ],
            },
        ],
    }

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": app_referer,
        "X-Title": app_title,
    }

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            try:
                response = await client.post(api_url, headers=headers, json=payload)
            except Exception as e:
                print(f"FATAL API CRASH: {repr(e)}", flush=True)
                raise
            response.raise_for_status()
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"VLM provider request failed: {exc}") from exc

    body = response.json()
    try:
        content = body["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as exc:
        raise HTTPException(
            status_code=502, detail="VLM provider returned an unexpected response format."
        ) from exc

    if isinstance(content, list):
        text_parts = [part.get("text", "") for part in content if isinstance(part, dict)]
        content = "".join(text_parts).strip()
    elif not isinstance(content, str):
        raise HTTPException(status_code=502, detail="VLM response content is not text.")

    print(f"[analyze] Raw VLM response text:\n{content}", flush=True)

    try:
        result = parse_strict_json(content)
    except ValueError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Invalid VLM JSON response after sanitization: {exc}",
        ) from exc

    # Enrich with ASTM grain number (VLM provides diameter estimate)
    result.astm_grain_number = astm_grain_number(result.average_grain_size_microns)
    return JSONResponse(content=result.model_dump())


@app.post("/api/grain-contours")
async def grain_contours(file: UploadFile = File(...)) -> JSONResponse:
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Please upload a valid image file.")
    image_bytes = await file.read()
    if not image_bytes:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    image = decode_uploaded_image(image_bytes)
    result = segment_grains(image)
    return JSONResponse(content=result)


@app.get("/api/materials-lookup")
async def materials_lookup(formula: str = Query(..., description="Chemical formula e.g. Fe2MnAl")) -> JSONResponse:
    phases = lookup_phases(formula)
    return JSONResponse(content=phases)
