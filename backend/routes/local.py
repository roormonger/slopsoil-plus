"""Local media source API routes for SlopSoil Web GUI.

Handles local directory browsing and local source management.
"""

import logging
import os
from typing import Any

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

import backend.database as db

log = logging.getLogger(__name__)
router = APIRouter(prefix="/local")

_MEDIA_ROOT = "/media"


class BrowseEntry(BaseModel):
    """A single entry in a directory listing."""
    name: str
    type: str  # "file" or "dir"
    path: str


class BrowseResponse(BaseModel):
    """Response for directory browse."""
    entries: list[BrowseEntry]


class LocalSourceResponse(BaseModel):
    """Response model for a local source."""
    name: str
    path: str
    type: str
    scan_depth: int
    enabled: bool


class LocalSourceAddRequest(BaseModel):
    """Request model for adding a local source."""
    name: str = Field(..., min_length=1)
    path: str = Field(..., min_length=1)
    type: str = Field(..., pattern="^(music|video)$")
    scan_depth: int = Field(default=0, ge=0, le=5)


def _resolve_media_path(path: str) -> str:
    """Resolve path and ensure it stays inside /media."""
    # Normalize and resolve symlinks
    resolved = os.path.realpath(os.path.abspath(path))
    media_real = os.path.realpath(os.path.abspath(_MEDIA_ROOT))
    # Ensure resolved path starts with media root
    if not (resolved == media_real or resolved.startswith(media_real + os.sep)):
        raise HTTPException(status_code=400, detail="Path is outside /media")
    return resolved


@router.get("/browse", response_model=BrowseResponse)
async def browse_directory(path: str = Query(..., min_length=1)) -> BrowseResponse:
    """Browse a directory under /media."""
    resolved = _resolve_media_path(path)

    if not os.path.isdir(resolved):
        raise HTTPException(status_code=404, detail="Directory not found")

    entries: list[BrowseEntry] = []
    try:
        for name in sorted(os.listdir(resolved)):
            full = os.path.join(resolved, name)
            # Skip hidden files
            if name.startswith("."):
                continue
            entry_type = "dir" if os.path.isdir(full) else "file"
            entries.append(BrowseEntry(name=name, type=entry_type, path=full))
    except OSError as exc:
        raise HTTPException(status_code=500, detail=f"Could not read directory: {exc}")

    return BrowseResponse(entries=entries)


@router.get("/sources", response_model=list[LocalSourceResponse])
async def get_local_sources() -> list[LocalSourceResponse]:
    """Get all local media sources."""
    sources = db.get_local_sources()
    return [
        LocalSourceResponse(
            name=src["name"],
            path=src["path"],
            type=src["type"],
            scan_depth=src["scan_depth"],
            enabled=src["enabled"],
        )
        for src in sources
    ]


@router.post("/sources")
async def add_local_source(request: LocalSourceAddRequest) -> dict[str, Any]:
    """Add a new local media source."""
    # Validate path is inside /media
    try:
        resolved = _resolve_media_path(request.path)
    except HTTPException:
        raise

    if not os.path.isdir(resolved):
        raise HTTPException(status_code=400, detail="Path does not exist or is not a directory")

    try:
        db.add_local_source(request.name, request.path, request.type, request.scan_depth)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Failed to add source: {exc}")

    return {"message": f"Added source '{request.name}'", "name": request.name}


@router.delete("/sources/{name}")
async def delete_local_source(name: str) -> dict[str, str]:
    """Remove a local media source by name."""
    deleted = db.delete_local_source(name)
    if not deleted:
        raise HTTPException(status_code=404, detail="Source not found")
    return {"message": f"Removed source '{name}'"}


@router.post("/sources/{name}/toggle")
async def toggle_local_source(name: str, body: dict[str, Any]) -> dict[str, Any]:
    """Toggle enable/disable state of a local source."""
    enabled = body.get("enabled")
    if not isinstance(enabled, bool):
        raise HTTPException(status_code=400, detail="'enabled' must be a boolean")

    updated = db.set_local_source_enabled(name, enabled)
    if not updated:
        raise HTTPException(status_code=404, detail="Source not found")
    return {
        "message": f"Source '{name}' {'enabled' if enabled else 'disabled'}",
        "enabled": enabled,
    }
