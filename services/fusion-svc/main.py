from fastapi import FastAPI
from pydantic import BaseModel
from typing import Optional, List

app = FastAPI(title="TrustLens Fusion Service")


class Provenance(BaseModel):
    has_c2pa: bool
    claims: Optional[dict] = None


class ImageSignal(BaseModel):
    p_ai: float
    reasons: List[str] = []


class FuseReq(BaseModel):
    provenance: Optional[Provenance] = None
    image: Optional[ImageSignal] = None


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/fuse")
def fuse(req: FuseReq):
    # naive rule: trust = (1 - p_ai)*100; boost if has_c2pa
    p_ai = req.image.p_ai if req.image else 0.5
    trust = int(round((1 - p_ai) * 100))
    explanations = []
    if req.provenance and req.provenance.has_c2pa:
        trust = max(trust, 85)
        explanations.append("content_credentials_present")
    verdict = (
        "likely_ai" if p_ai >= 0.8 else "likely_real" if p_ai <= 0.2 else "inconclusive"
    )
    return {"trust_score": trust, "verdict": verdict, "explanations": explanations}
