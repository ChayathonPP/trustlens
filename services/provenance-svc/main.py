from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Optional
import base64
import io
import requests
from PIL import Image

app = FastAPI(title="TrustLens Provenance Service")


class VerifyImageReq(BaseModel):
    content_url: Optional[str] = None
    content_b64: Optional[str] = None


def _load_bytes(req: VerifyImageReq) -> bytes:
    if req.content_b64:
        try:
            return base64.b64decode(req.content_b64.split(",")[-1], validate=False)
        except Exception as e:
            raise HTTPException(400, f"Invalid base64: {e}")
    if req.content_url:
        try:
            r = requests.get(req.content_url, timeout=15)
            r.raise_for_status()
            return r.content
        except Exception as e:
            raise HTTPException(400, f"Failed to fetch URL: {e}")
    raise HTTPException(400, "Provide content_url or content_b64")


def _basic_c2pa_probe(img_bytes: bytes) -> dict:
    """
    Heuristic probe:
    - look for 'c2pa'/'C2PA' strings in the file
    - check if it seems to contain XMP / Content Credentials markers
    - try to open image to confirm it's an image
    """
    lower = img_bytes.lower()
    reasons = []
    has_c2pa = False
    claims = {}

    # Probes
    if b"c2pa" in lower or b"content credentials" in lower or b"xmp" in lower:
        has_c2pa = True
        reasons.append("c2pa_strings_present")

    # Try PIL to validate image and glean format
    try:
        im = Image.open(io.BytesIO(img_bytes))
        claims["format"] = im.format
        claims["size"] = im.size
        # Some generators/software add useful XMP blocks; PIL doesn't expose directly,
        # but presence of XMP keywords in bytes already flagged above.
    except Exception:
        reasons.append("not_a_valid_image")

    if not has_c2pa:
        reasons.append("no_c2pa_manifest_detected")

    return {
        "has_c2pa": has_c2pa,
        "claims": claims if has_c2pa else None,
        "reasons": reasons,
    }


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/verify_image")
def verify_image(req: VerifyImageReq):
    img_bytes = _load_bytes(req)
    result = _basic_c2pa_probe(img_bytes)
    return result
