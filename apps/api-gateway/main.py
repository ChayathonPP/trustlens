from fastapi.middleware.cors import CORSMiddleware
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Optional
import httpx
import os

app = FastAPI(title="TrustLens API Gateway")

PROV_URL = os.getenv("PROVENANCE_URL", "http://provenance-svc:7001")
IMG_URL = os.getenv("IMAGE_URL", "http://image-detector:7002")
FUSE_URL = os.getenv("FUSION_URL", "http://fusion-svc:7003")


class AnalyzeReq(BaseModel):
    type: str  # "image" | "video" | "audio" | "text"
    content_url: Optional[str] = None
    content_b64: Optional[str] = None


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/analyze")
def analyze(req: AnalyzeReq):
    if req.type != "image":
        raise HTTPException(400, "Only 'image' supported in MVP")
    payload = req.model_dump()
    with httpx.Client(timeout=20.0) as client:
        prov = client.post(f"{PROV_URL}/verify_image", json=payload).json()
        img = client.post(f"{IMG_URL}/score_image", json=payload).json()
        fused = client.post(
            f"{FUSE_URL}/fuse", json={"provenance": prov, "image": img}
        ).json()
    return {"trust": fused, "signals": {"provenance": prov, "image": img}}


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For development. Restrict in production if needed.
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
