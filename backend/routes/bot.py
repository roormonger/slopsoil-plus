"""Bot status API routes for SlopSoil Web GUI.

Handles bot status, reload, and now-playing information.
"""

import logging
from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel

from backend.bot_runner import (
    get_bot_status,
    reload_bot,
    get_now_playing,
    get_pending_reload_status,
)

log = logging.getLogger(__name__)
router = APIRouter()


class BotInfo(BaseModel):
    """Bot user information."""
    id: str | None = None
    name: str | None = None
    avatar_url: str | None = None


class BotStatusResponse(BaseModel):
    """Response model for bot status."""
    status: str
    running: bool
    has_token: bool
    user_count: int
    streaming_count: int
    guild_count: int
    voice_channels: int = 0
    latency: float = 0
    bot: BotInfo | None = None


class ReloadResponse(BaseModel):
    """Response model for bot reload."""
    success: bool
    message: str


class NowPlayingResponse(BaseModel):
    """Response model for now playing."""
    streams: list[dict[str, Any]]
    count: int = 0


class PendingReloadResponse(BaseModel):
    """Response model for pending reload status."""
    needs_reload: bool
    last_modified: str | None = None


@router.get("/bot/status", response_model=BotStatusResponse)
async def get_status() -> BotStatusResponse:
    """Get current bot status."""
    return BotStatusResponse(**get_bot_status())


@router.post("/bot/reload", response_model=ReloadResponse)
async def reload_bot_endpoint() -> ReloadResponse:
    """Hot-reload the Discord bot with fresh configuration."""
    success = await reload_bot()
    if success:
        return ReloadResponse(success=True, message="Bot reloaded successfully")
    else:
        return ReloadResponse(success=False, message="Failed to reload bot. Check logs and ensure Discord token is configured.")


@router.get("/bot/pending-reload", response_model=PendingReloadResponse)
async def get_pending_reload_endpoint() -> PendingReloadResponse:
    """Check if bot needs reload due to config changes."""
    return PendingReloadResponse(**get_pending_reload_status())


@router.get("/now-playing", response_model=NowPlayingResponse)
async def get_now_playing_endpoint() -> NowPlayingResponse:
    """Get currently playing video streams."""
    return NowPlayingResponse(**get_now_playing())
