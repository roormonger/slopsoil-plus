"""Music player API routes for SlopSoil Web GUI.

Handles music playback, queue management, and volume control.
"""

import logging
from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel, Field

from backend.bot_runner import execute_bot_command

log = logging.getLogger(__name__)
router = APIRouter(prefix="/music")


class MusicTrackResponse(BaseModel):
    """Response model for a music track."""
    url: str
    title: str
    duration: int
    thumbnail: str
    requested_by: str
    webpage_url: str


class MusicStatusResponse(BaseModel):
    """Response model for music status."""
    current: MusicTrackResponse | None = None
    queue: list[MusicTrackResponse]
    queue_length: int
    volume: float
    is_playing: bool
    is_paused: bool


class MusicPlayRequest(BaseModel):
    """Request model for playing music."""
    guild_id: str = Field(..., min_length=1)
    query: str = Field(..., min_length=1)


class MusicControlRequest(BaseModel):
    """Request model for music control."""
    guild_id: str = Field(..., min_length=1)
    action: str = Field(..., pattern="^(stop|skip|back|pause|resume)$")


class MusicVolumeRequest(BaseModel):
    """Request model for setting volume."""
    guild_id: str = Field(..., min_length=1)
    volume: int = Field(..., ge=0, le=100)


class MusicActionResponse(BaseModel):
    """Response model for music actions."""
    success: bool
    message: str


@router.get("/status", response_model=MusicStatusResponse)
async def get_music_status_endpoint() -> MusicStatusResponse:
    """Get current music playback status."""
    from backend.bot_runner import get_bot_instance
    bot = get_bot_instance()
    if bot is None:
        return MusicStatusResponse(
            current=None,
            queue=[],
            queue_length=0,
            volume=1.0,
            is_playing=False,
            is_paused=False,
        )

    # Get the first guild's music status (for now, single guild support)
    guild_id = next(iter(bot.music_current.keys()), None)

    if guild_id is None:
        return MusicStatusResponse(
            current=None,
            queue=[],
            queue_length=0,
            volume=1.0,
            is_playing=False,
            is_paused=False,
        )

    current = bot.music_current.get(guild_id)
    queue = bot.music_queues.get(guild_id, [])
    volume = bot.music_volumes.get(guild_id, 1.0)

    # Check if actually playing
    guild = bot.get_guild(guild_id)
    is_playing = False
    is_paused = False
    if guild and guild.voice_client:
        is_playing = guild.voice_client.is_playing()
        is_paused = guild.voice_client.is_paused()

    current_track = None
    if current:
        current_track = MusicTrackResponse(
            url=current.url,
            title=current.title,
            duration=current.duration,
            thumbnail=current.thumbnail,
            requested_by=current.requested_by,
            webpage_url=current.webpage_url,
        )

    queue_tracks = [
        MusicTrackResponse(
            url=track.url,
            title=track.title,
            duration=track.duration,
            thumbnail=track.thumbnail,
            requested_by=track.requested_by,
            webpage_url=track.webpage_url,
        )
        for track in queue
    ]

    return MusicStatusResponse(
        current=current_track,
        queue=queue_tracks,
        queue_length=len(queue_tracks),
        volume=volume,
        is_playing=is_playing,
        is_paused=is_paused,
    )


@router.post("/play", response_model=MusicActionResponse)
async def play_music_endpoint(request: MusicPlayRequest) -> MusicActionResponse:
    """Play or queue music in a guild."""
    result = await execute_bot_command(request.guild_id, "music", request.query)
    return MusicActionResponse(**result)


@router.post("/control", response_model=MusicActionResponse)
async def control_music_endpoint(request: MusicControlRequest) -> MusicActionResponse:
    """Control music playback (stop, skip, back, pause, resume)."""
    result = await execute_bot_command(request.guild_id, f"music {request.action}", "")
    return MusicActionResponse(**result)


@router.post("/volume", response_model=MusicActionResponse)
async def set_music_volume_endpoint(request: MusicVolumeRequest) -> MusicActionResponse:
    """Set music volume (0-100)."""
    result = await execute_bot_command(request.guild_id, "music volume", str(request.volume))
    return MusicActionResponse(**result)
