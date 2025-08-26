from fastapi import FastAPI
from pydantic import BaseModel
from typing import Optional

app = FastAPI(title="TrustLens Image Detector")


class ScoreImageReq(BaseModel):
    content_url: Optional[str] = None
    content_b64: Optional[str] = None


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/score_image")
def score_image(req: ScoreImageReq):
    # stub probability and reasons
    return {"p_ai": 0.5, "reasons": []}
