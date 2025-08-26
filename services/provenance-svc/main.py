from fastapi import FastAPI
from pydantic import BaseModel
from typing import Optional

app = FastAPI(title="TrustLens Provenance Service")


class VerifyImageReq(BaseModel):
    content_url: Optional[str] = None
    content_b64: Optional[str] = None


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/verify_image")
def verify_image(req: VerifyImageReq):
    # stub: no real C2PA yet
    return {"has_c2pa": False, "claims": None, "reasons": ["no_c2pa_manifest_detected"]}
