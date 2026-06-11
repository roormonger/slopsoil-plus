"""Audio player API routes for SlopSoil Web GUI.

Handles audio playback, queue management, and volume control.
"""

import logging

from fastapi import APIRouter
from pydantic import BaseModel, Field

from backend.bot_runner import execute_bot_command

log = logging.getLogger(__name__)
router = APIRouter(prefix="/audio")


class AudioTrackResponse(BaseModel):
    """Response model for an audio track."""
    url: str
    title: str
    duration: int
    thumbnail: str
    requested_by: str
    webpage_url: str


class AudioStatusResponse(BaseModel):
    """Response model for audio status."""
    current: AudioTrackResponse | None = None
    queue: list[AudioTrackResponse]
    queue_length: int
    volume: float
    is_playing: bool
    is_paused: bool


class AudioPlayRequest(BaseModel):
    """Request model for playing audio."""
    guild_id: str = Field(..., min_length=1)
    query: str = Field(..., min_length=1)
    channel_id: str | None = None


class AudioControlRequest(BaseModel):
    """Request model for audio control."""
    guild_id: str = Field(..., min_length=1)
    action: str = Field(..., pattern="^(stop|skip|back|pause|resume)$")
    channel_id: str | None = None


class AudioVolumeRequest(BaseModel):
    """Request model for setting volume."""
    guild_id: str = Field(..., min_length=1)
    volume: int = Field(..., ge=0, le=100)
    channel_id: str | None = None


class AudioActionResponse(BaseModel):
    """Response model for audio actions."""
    success: bool
    message: str


@router.get("/status", response_model=AudioStatusResponse)
async def get_audio_status_endpoint() -> AudioStatusResponse:
    """Get current audio playback status."""
    from backend.bot_runner import get_bot_instance
    bot = get_bot_instance()
    if bot is None:
        return AudioStatusResponse(
            current=None,
            queue=[],
            queue_length=0,
            volume=1.0,
            is_playing=False,
            is_paused=False,
        )

    guild_id = next(iter(bot.music_current.keys()), None)

    if guild_id is None:
        return AudioStatusResponse(
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

    guild = bot.get_guild(guild_id)
    is_playing = False
    is_paused = False
    if guild and guild.voice_client:
        is_playing = guild.voice_client.is_playing()
        is_paused = guild.voice_client.is_paused()

    current_track = None
    if current:
        current_track = AudioTrackResponse(
            url=current.url,
            title=current.title,
            duration=current.duration,
            thumbnail=current.thumbnail,
            requested_by=current.requested_by,
            webpage_url=current.webpage_url,
        )

    queue_tracks = [
        AudioTrackResponse(
            url=track.url,
            title=track.title,
            duration=track.duration,
            thumbnail=track.thumbnail,
            requested_by=track.requested_by,
            webpage_url=track.webpage_url,
        )
        for track in queue
    ]

    return AudioStatusResponse(
        current=current_track,
        queue=queue_tracks,
        queue_length=len(queue_tracks),
        volume=volume,
        is_playing=is_playing,
        is_paused=is_paused,
    )


@router.post("/play", response_model=AudioActionResponse)
async def play_audio_endpoint(request: AudioPlayRequest) -> AudioActionResponse:
    """Play or queue audio in a guild."""
    result = await execute_bot_command(request.guild_id, "audio", request.query, channel_id=request.channel_id)
    return AudioActionResponse(**result)


@router.post("/control", response_model=AudioActionResponse)
async def control_audio_endpoint(request: AudioControlRequest) -> AudioActionResponse:
    """Control audio playback (stop, skip, back, pause, resume)."""
    result = await execute_bot_command(request.guild_id, f"audio {request.action}", "", channel_id=request.channel_id)
    return AudioActionResponse(**result)


@router.post("/volume", response_model=AudioActionResponse)
async def set_audio_volume_endpoint(request: AudioVolumeRequest) -> AudioActionResponse:
    """Set audio volume (0-100)."""
    result = await execute_bot_command(request.guild_id, "audio volume", str(request.volume), channel_id=request.channel_id)
    return AudioActionResponse(**result)
