"""Featured items API routes for SlopSoil Web GUI.

Handles featured item management per category (iptv, bookmark, jellyfin, soundboard).
"""

import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from backend.auth import get_current_user, TokenData
from backend.database import (
    get_featured,
    toggle_featured,
    FEATURED_CATEGORIES,
    get_setting,
    set_setting,
)

log = logging.getLogger(__name__)
router = APIRouter(prefix="/featured")

CATEGORY_SETTING_KEYS = {
    "iptv": "featured_iptv_enabled",
    "bookmark": "featured_bookmarks_enabled",
    "jellyfin": "featured_jellyfin_enabled",
    "soundboard": "featured_soundboard_enabled",
}


class FeaturedListResponse(BaseModel):
    category: str
    items: list[str]
    enabled: bool


class ToggleFeaturedRequest(BaseModel):
    item_id: str


class ToggleFeaturedResponse(BaseModel):
    category: str
    item_id: str
    featured: bool


class FeaturedSettingsResponse(BaseModel):
    iptv: bool
    bookmarks: bool
    jellyfin: bool
    soundboard: bool


class FeaturedSettingsUpdateRequest(BaseModel):
    iptv: bool | None = None
    bookmarks: bool | None = None
    jellyfin: bool | None = None
    soundboard: bool | None = None


def _require_admin(current_user: TokenData) -> None:
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")


@router.get("/{category}", response_model=FeaturedListResponse)
async def list_featured(category: str) -> FeaturedListResponse:
    """Get all featured items for a category."""
    if category not in FEATURED_CATEGORIES:
        raise HTTPException(status_code=404, detail=f"Unknown category: {category}")
    setting_key = CATEGORY_SETTING_KEYS[category]
    enabled = get_setting(setting_key) != "0"
    items = get_featured(category)
    return FeaturedListResponse(category=category, items=items, enabled=enabled)


@router.post("/{category}/toggle", response_model=ToggleFeaturedResponse)
async def toggle_featured_item(
    category: str,
    request: ToggleFeaturedRequest,
    current_user: TokenData = Depends(get_current_user),
) -> ToggleFeaturedResponse:
    """Toggle featured state for an item. Admin only."""
    _require_admin(current_user)
    if category not in FEATURED_CATEGORIES:
        raise HTTPException(status_code=404, detail=f"Unknown category: {category}")
    now_featured = toggle_featured(category, request.item_id)
    return ToggleFeaturedResponse(category=category, item_id=request.item_id, featured=now_featured)


@router.get("/settings/all", response_model=FeaturedSettingsResponse)
async def get_featured_settings() -> FeaturedSettingsResponse:
    """Get enabled/disabled state for all featured sections."""
    return FeaturedSettingsResponse(
        iptv=get_setting("featured_iptv_enabled") != "0",
        bookmarks=get_setting("featured_bookmarks_enabled") != "0",
        jellyfin=get_setting("featured_jellyfin_enabled") != "0",
        soundboard=get_setting("featured_soundboard_enabled") != "0",
    )


@router.patch("/settings/all", response_model=FeaturedSettingsResponse)
async def update_featured_settings(
    request: FeaturedSettingsUpdateRequest,
    current_user: TokenData = Depends(get_current_user),
) -> FeaturedSettingsResponse:
    """Update enabled/disabled state for featured sections. Admin only."""
    _require_admin(current_user)
    if request.iptv is not None:
        set_setting("featured_iptv_enabled", "1" if request.iptv else "0")
    if request.bookmarks is not None:
        set_setting("featured_bookmarks_enabled", "1" if request.bookmarks else "0")
    if request.jellyfin is not None:
        set_setting("featured_jellyfin_enabled", "1" if request.jellyfin else "0")
    if request.soundboard is not None:
        set_setting("featured_soundboard_enabled", "1" if request.soundboard else "0")
    return FeaturedSettingsResponse(
        iptv=get_setting("featured_iptv_enabled") != "0",
        bookmarks=get_setting("featured_bookmarks_enabled") != "0",
        jellyfin=get_setting("featured_jellyfin_enabled") != "0",
        soundboard=get_setting("featured_soundboard_enabled") != "0",
    )
