"""
MoSPI Unified Survey Platform — FastAPI Backend
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import logging

from app.routers import auth, surveys, pipeline, dq, stats, lineage, webhooks, sampling, forms

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="MoSPI USP API",
    description="Unified Survey Platform — Ministry of Statistics & Programme Implementation",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(auth.router,      prefix="/auth",     tags=["Auth"])
app.include_router(surveys.router,   prefix="/surveys",  tags=["Surveys"])
app.include_router(forms.router,     prefix="/forms",    tags=["Forms"])
app.include_router(sampling.router,  prefix="/sampling", tags=["Sampling"])
app.include_router(pipeline.router,  prefix="/pipeline", tags=["DI Pipeline"])
app.include_router(dq.router,        prefix="/dq",       tags=["Data Quality"])
app.include_router(stats.router,     prefix="/stats",    tags=["Statistical Analysis"])
app.include_router(lineage.router,   prefix="/lineage",  tags=["Lineage"])
app.include_router(webhooks.router,  prefix="/webhooks", tags=["Webhooks"])


@app.get("/health", tags=["System"])
async def health():
    return {"status": "ok", "service": "mospi-usp-api", "version": "1.0.0"}


@app.on_event("startup")
async def startup_event():
    logger.info("MoSPI USP API starting up …")
