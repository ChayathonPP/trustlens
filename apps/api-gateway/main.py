from fastapi import FastAPI
from pydantic import BaseModel
from typing import Optional

app = FastAPI(title="TrustLens API Gateway")

class AnalyzeReq(BaseModel):
    type: str  # "image" | "video" | "audio" | "text"
    content_url: Optional[str] = None
    content_b64: Optional[str] = None

@app.get("/health")
def health():
    return {"ok": True}

@app.post("/analyze")
def analyze(req: AnalyzeReq):
    # stub for now; will call services later
    return {
        "type": req.type,
        "trust_score": None,
        "provenance": None,
        "signals": [],
    }
