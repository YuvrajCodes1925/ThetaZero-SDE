import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from app.routers import collections, reinforcement, chat, analysis, document_chat, user
from app.database import db
from app.migrations import run_migrations

# ─── Environment Configuration ────────────────────────────────────────────────
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:4173")
ORIGINS     = [url.strip() for url in FRONTEND_URL.split(",") if url.strip()]

# Directory where your Vite build lives
SPA_DIST    = os.getenv("SPA_DIST", "app/static/dist")
INDEX_FILE  = os.path.join(SPA_DIST, "index.html")
ASSETS_DIR  = os.path.join(SPA_DIST, "assets")

# ─── Lifespan Event Handler ───────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    print("FastAPI application is starting up…")
    await run_migrations(db)
    yield
    print("FastAPI application is shutting down…")

# ─── App Initialization ───────────────────────────────────────────────────────
app = FastAPI(
    title="DocParser API",
    description="An API for parsing documents, generating learning materials, and chatting with your content.",
    version="1.0.0",
    lifespan=lifespan
)

# ─── CORS ─────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── API Routers under /api ───────────────────────────────────────────────────
app.include_router(collections.router,   prefix="/api", tags=["Collections & Sources"])
app.include_router(reinforcement.router, prefix="/api", tags=["Reinforcement Tools"])
app.include_router(chat.router,          prefix="/api", tags=["Chat"])
app.include_router(analysis.router,      prefix="/api", tags=["Document Analysis"])
app.include_router(document_chat.router, prefix="/api", tags=["Document Chat"])
app.include_router(user.router,          prefix="/api/user", tags=["User"])

# ─── Static Assets (JS/CSS/etc) ───────────────────────────────────────────────
# Only mount the hashed assets directory—Vite puts everything under /assets
app.mount("/assets", StaticFiles(directory=ASSETS_DIR), name="assets")

# ─── Favicon, if you have one ─────────────────────────────────────────────────
@app.get("/favicon.ico", include_in_schema=False)
async def favicon():
    ico_path = os.path.join(SPA_DIST, "favicon.ico")
    return FileResponse(ico_path) if os.path.exists(ico_path) else FileResponse(INDEX_FILE)

# ─── API Health Check ─────────────────────────────────────────────────────────
@app.get("/api", tags=["Root"])
def read_root():
    return {"status": "DocParser API is online and running."}

# ─── Serve index.html at / ────────────────────────────────────────────────────
@app.get("/", include_in_schema=False)
async def serve_index():
    return FileResponse(INDEX_FILE)

# ─── Catch‑all for Client‑side Routes ──────────────────────────────────────────
@app.get("/{full_path:path}", include_in_schema=False)
async def spa_fallback(full_path: str):
    """
    Any GET that isn’t /api/... or /assets/... will land here.
    Return index.html so React Router can handle the route.
    """
    return FileResponse(INDEX_FILE)
