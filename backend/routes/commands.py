"""Command history and analytics routes."""

from typing import Any

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel

from backend.auth import get_current_user
from backend.database import get_command_history, get_command_stats

router = APIRouter(tags=["commands"])


class CommandHistoryEntry(BaseModel):
    """Single command history entry."""
    id: int
    timestamp: str
    source: str
    command: str
    args: str | None = None
    user_id: str | None = None
    username: str | None = None
    guild_id: str | None = None
    guild_name: str | None = None
    channel_id: str | None = None
    channel_name: str | None = None
    cog_name: str | None = None
    is_voice: bool = False
    is_video: bool = False
    is_music: bool = False
    success: bool = True
    error_message: str | None = None


class CommandHistoryResponse(BaseModel):
    """Paginated command history response."""
    history: list[CommandHistoryEntry]
    total: int


class CommandStatsResponse(BaseModel):
    """Aggregated command statistics."""
    total: int
    by_command: list[dict[str, Any]]
    by_user: list[dict[str, Any]]
    by_guild: list[dict[str, Any]]
    by_source: dict[str, int]
    by_category: dict[str, int]


@router.get("/history", response_model=CommandHistoryResponse)
@router.get("/history/", response_model=CommandHistoryResponse)
async def get_history(
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    source: str | None = Query(None),
    guild_id: str | None = Query(None),
    user_id: str | None = Query(None),
    current_user: dict = Depends(get_current_user),
) -> CommandHistoryResponse:
    """Get paginated command history, optionally filtered."""
    history = get_command_history(
        limit=limit,
        offset=offset,
        source=source,
        guild_id=guild_id,
        user_id=user_id,
    )
    return CommandHistoryResponse(
        history=[CommandHistoryEntry(**row) for row in history],
        total=len(history),
    )


@router.get("/stats", response_model=CommandStatsResponse)
@router.get("/stats/", response_model=CommandStatsResponse)
async def get_stats(
    days: int = Query(30, ge=1, le=365),
    current_user: dict = Depends(get_current_user),
) -> CommandStatsResponse:
    """Get aggregated command statistics for the given time window."""
    stats = get_command_stats(days=days)
    return CommandStatsResponse(**stats)
