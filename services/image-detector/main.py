from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Optional, List
import base64
import io
import requests
import numpy as np
from PIL import Image

app = FastAPI(title="TrustLens Image Detector")


class ScoreImageReq(BaseModel):
    content_url: Optional[str] = None
    content_b64: Optional[str] = None


def _load_image(req: ScoreImageReq) -> Image.Image:
    data = None
    if req.content_b64:
        try:
            data = base64.b64decode(req.content_b64.split(",")[-1], validate=False)
        except Exception as e:
            raise HTTPException(400, f"Invalid base64: {e}")
    elif req.content_url:
        try:
            r = requests.get(req.content_url, timeout=15)
            r.raise_for_status()
            data = r.content
        except Exception as e:
            raise HTTPException(400, f"Failed to fetch URL: {e}")
    else:
        raise HTTPException(400, "Provide content_url or content_b64")

    try:
        im = Image.open(io.BytesIO(data)).convert("L")  # grayscale
        return im
    except Exception as e:
        raise HTTPException(400, f"Not an image: {e}")


def _fft_highfreq_ratio(im: Image.Image) -> float:
    # Normalize size for consistent spectrum stats
    im_small = im.resize((256, 256))
    arr = np.asarray(im_small, dtype=np.float32) / 255.0

    # FFT -> shift DC to center
    F = np.fft.fftshift(np.fft.fft2(arr))
    mag = np.abs(F)

    # Radial mask: consider outer ring as high frequency
    h, w = mag.shape
    cy, cx = h // 2, w // 2
    Y, X = np.ogrid[:h, :w]
    R = np.sqrt((Y - cy) ** 2 + (X - cx) ** 2)
    r_max = np.sqrt((cy) ** 2 + (cx) ** 2)

    # low radius = keep central 20%, high = outside 60% (tunable)
    low_mask = R <= (0.2 * r_max)
    high_mask = R >= (0.6 * r_max)

    total = mag.sum() + 1e-8
    high = mag[high_mask].sum()
    _ = mag[low_mask].sum()

    ratio = float(high / total)
    return ratio


def _score_from_ratio(ratio: float) -> (float, List[str]):
    reasons = []
    # heuristics (tune later on data)
    if ratio >= 0.36:
        p_ai = 0.85
        reasons.append("very_high_frequency_energy")
    elif ratio >= 0.30:
        p_ai = 0.70
        reasons.append("high_frequency_energy")
    elif ratio <= 0.12:
        p_ai = 0.25
        reasons.append("very_low_frequency_energy")
    else:
        p_ai = 0.50
        reasons.append("medium_frequency_energy")
    return p_ai, reasons


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/score_image")
def score_image(req: ScoreImageReq):
    im = _load_image(req)
    ratio = _fft_highfreq_ratio(im)
    p_ai, reasons = _score_from_ratio(ratio)
    return {
        "p_ai": p_ai,
        "reasons": reasons + [f"fft_highfreq_ratio={ratio:.3f}"],
    }
