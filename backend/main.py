"""Unified entrypoint for SlopSoil Web GUI and Discord Bot."""

from __future__ import annotations

import asyncio
import logging
import os
import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from backend.routes import router
from backend.bot_runner import start_bot

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)
log = logging.getLogger(__name__)

# Get port from environment (default 3000)
PORT = int(os.environ.get("PORT", 3000))

# Create FastAPI app
app = FastAPI(title="SlopSoil Admin Panel")

# Add CORS middleware (allow frontend dev server)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],  # Vite dev server
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API routes
app.include_router(router)

# Mount static files (frontend build) if dist exists
FRONTEND_DIST = Path("frontend/dist")
if FRONTEND_DIST.exists():
    # Mount static files for specific assets
    app.mount("/assets", StaticFiles(directory=str(FRONTEND_DIST / "assets")), name="assets")
    
    # Serve index.html for root
    @app.get("/")
    async def read_index():
        return FileResponse(FRONTEND_DIST / "index.html")
    
    # SPA fallback - serve index.html for any non-API routes
    @app.get("/{full_path:path}")
    async def spa_fallback(full_path: str):
        # Don't intercept API routes
        if full_path.startswith("api/"):
            return {"detail": "Not Found"}, 404
        
        # Check if it's a static file that exists
        file_path = FRONTEND_DIST / full_path
        if file_path.exists() and file_path.is_file():
            return FileResponse(file_path)
        
        # For all other routes, serve index.html for SPA routing
        return FileResponse(FRONTEND_DIST / "index.html")
    
    log.info("Mounted static files from frontend/dist with SPA routing")
else:
    log.warning("frontend/dist not found - run 'npm run build' in frontend/")

    # Fallback root endpoint for API-only mode
    @app.get("/")
    async def root() -> dict[str, str]:
        return {"message": "SlopSoil API - Frontend not built"}


async def start_web_server() -> None:
    """Start the FastAPI/uvicorn server."""
    config = uvicorn.Config(
        app,
        host="0.0.0.0",
        port=PORT,
        log_level="info",
    )
    server = uvicorn.Server(config)
    log.info("Starting web server on port %d", PORT)
    await server.serve()


async def main() -> None:
    """Run both web server and Discord bot concurrently."""
    log.info("Starting SlopSoil Admin Panel...")

    # Start services concurrently
    await asyncio.gather(
        start_web_server(),
        start_bot(),
    )


if __name__ == "__main__":
    asyncio.run(main())
