"""Bookmarks API routes for SlopSoil Web GUI.

Handles bookmark management for direct stream URLs.
"""

import logging
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from backend.database import get_bookmarks, add_bookmark, delete_bookmark, set_bookmark_enabled

log = logging.getLogger(__name__)
router = APIRouter(prefix="/bookmarks")


class BookmarkResponse(BaseModel):
    """Response model for a bookmark."""
    id: int
    name: str
    url: str
    enabled: bool


class BookmarkAddRequest(BaseModel):
    """Request model for adding a bookmark."""
    name: str = Field(..., min_length=1)
    url: str = Field(..., min_length=1)


class BookmarkActionResponse(BaseModel):
    """Response model for bookmark actions."""
    message: str
    enabled: bool | None = None


@router.get("", response_model=list[BookmarkResponse])
@router.get("/", response_model=list[BookmarkResponse])
async def get_bookmarks_endpoint() -> list[BookmarkResponse]:
    """Get all bookmarks."""
    bookmarks = get_bookmarks()
    return [BookmarkResponse(**bm) for bm in bookmarks]


@router.post("/", response_model=BookmarkActionResponse)
async def add_bookmark_endpoint(request: BookmarkAddRequest) -> BookmarkActionResponse:
    """Add a new bookmark."""
    try:
        add_bookmark(request.name, request.url)
        return BookmarkActionResponse(message=f"Added bookmark '{request.name}'")
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Failed to add bookmark: {exc}")


@router.delete("/{bookmark_id}", response_model=BookmarkActionResponse)
async def delete_bookmark_endpoint(bookmark_id: int) -> BookmarkActionResponse:
    """Delete a bookmark by ID."""
    success = delete_bookmark(bookmark_id)
    if not success:
        raise HTTPException(status_code=404, detail="Bookmark not found")
    return BookmarkActionResponse(message="Bookmark deleted")


@router.post("/{bookmark_id}/toggle", response_model=BookmarkActionResponse)
async def toggle_bookmark_endpoint(bookmark_id: int) -> BookmarkActionResponse:
    """Toggle enable/disable state of a bookmark."""
    bookmarks = get_bookmarks()
    for bm in bookmarks:
        if bm["id"] == bookmark_id:
            new_state = not bm["enabled"]
            set_bookmark_enabled(bookmark_id, new_state)
            return BookmarkActionResponse(
                message=f"Bookmark '{bm['name']}' {'enabled' if new_state else 'disabled'}",
                enabled=new_state,
            )
    raise HTTPException(status_code=404, detail="Bookmark not found")
