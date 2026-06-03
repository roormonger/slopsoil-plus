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
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from pydantic import ValidationError

from backend.routes import router
from backend.ws import ws_router
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
app.include_router(ws_router)


# Exception handler to log validation errors for debugging
@app.exception_handler(ValidationError)
async def validation_exception_handler(request: Request, exc: ValidationError):
    """Log Pydantic validation errors with full details."""
    log.error(
        "Pydantic validation error on %s %s: %s",
        request.method,
        request.url.path,
        exc.errors(),
    )
    # Return JSON error instead of HTML
    return JSONResponse(
        status_code=422,
        content={
            "detail": "Validation error",
            "errors": exc.errors(),
        },
    )


# Generic HTTP exception handler for API routes
@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    """Ensure API routes return JSON errors, not HTML."""
    if request.url.path.startswith("/api/"):
        return JSONResponse(
            status_code=exc.status_code,
            content={"detail": exc.detail},
        )
    # For non-API routes, let the default handler serve HTML
    raise exc


# Mount static files (frontend build) if dist exists
FRONTEND_DIST = Path("frontend/dist")
if FRONTEND_DIST.exists():
    # Mount static files for specific assets
    app.mount("/assets", StaticFiles(directory=str(FRONTEND_DIST / "assets")), name="assets")
    
    # Serve index.html for root
    @app.get("/")
    async def read_index():
        return FileResponse(FRONTEND_DIST / "index.html")
    
    # SPA fallback - serve index.html for frontend routes
    @app.get("/{full_path:path}", response_model=None)
    async def spa_fallback(full_path: str):
        # Skip API paths - let them return 404 as JSON
        if full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail=f"API endpoint not found: /{full_path}")

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
