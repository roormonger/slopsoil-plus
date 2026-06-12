"""Music player API routes for SlopSoil Web GUI.

Handles music playback, queue management, and volume control.
"""

import asyncio
import logging
import random
from typing import Any

from fastapi import APIRouter, Query
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
    channel_id: str | None = None


class MusicControlRequest(BaseModel):
    """Request model for music control."""
    guild_id: str = Field(..., min_length=1)
    action: str = Field(..., pattern="^(stop|skip|back|pause|resume)$")
    channel_id: str | None = None


class MusicVolumeRequest(BaseModel):
    """Request model for setting volume."""
    guild_id: str = Field(..., min_length=1)
    volume: int = Field(..., ge=0, le=100)
    channel_id: str | None = None


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
    result = await execute_bot_command(request.guild_id, "music", request.query, channel_id=request.channel_id)
    return MusicActionResponse(**result)


@router.post("/control", response_model=MusicActionResponse)
async def control_music_endpoint(request: MusicControlRequest) -> MusicActionResponse:
    """Control music playback (stop, skip, back, pause, resume)."""
    result = await execute_bot_command(request.guild_id, f"music {request.action}", "", channel_id=request.channel_id)
    return MusicActionResponse(**result)


class TrackMeta(BaseModel):
    """Lightweight track metadata for browse/search results."""
    id: str
    title: str
    uploader: str
    duration: int
    thumbnail: str
    webpage_url: str


def _flat_entry_to_meta(entry: dict) -> TrackMeta | None:
    """Convert a yt-dlp flat entry to TrackMeta."""
    vid_id = entry.get("id") or entry.get("url", "")
    if not vid_id:
        return None
    webpage_url = entry.get("webpage_url") or f"https://www.youtube.com/watch?v={vid_id}"
    thumbnail = (
        entry.get("thumbnail")
        or (entry.get("thumbnails") or [{}])[-1].get("url", "")
        or f"https://i.ytimg.com/vi/{vid_id}/mqdefault.jpg"
    )
    return TrackMeta(
        id=vid_id,
        title=entry.get("title") or "Unknown",
        uploader=entry.get("uploader") or entry.get("channel") or "",
        duration=int(entry.get("duration") or 0),
        thumbnail=thumbnail,
        webpage_url=webpage_url,
    )


async def _yt_flat(search_url: str, limit: int) -> list[TrackMeta]:
    """Run yt-dlp extract_flat in a thread and return TrackMeta list."""
    import yt_dlp

    opts = {
        "quiet": True,
        "no_warnings": True,
        "extract_flat": True,
        "playlistend": limit,
    }

    def _run() -> list[dict]:
        try:
            with yt_dlp.YoutubeDL(opts) as ydl:
                info = ydl.extract_info(search_url, download=False)
                if not info:
                    return []
                if "entries" in info:
                    return [e for e in (info["entries"] or []) if e]
                return [info]
        except Exception as exc:
            log.warning("yt-dlp flat extract failed for %s: %s", search_url, exc)
            return []

    loop = asyncio.get_event_loop()
    entries = await loop.run_in_executor(None, _run)
    results: list[TrackMeta] = []
    for e in entries:
        meta = _flat_entry_to_meta(e)
        if meta:
            results.append(meta)
        if len(results) >= limit:
            break
    return results


@router.get("/search", response_model=list[TrackMeta])
async def search_music(
    q: str = Query(..., min_length=1),
    limit: int = Query(100, ge=1, le=100),
) -> list[TrackMeta]:
    """Search YouTube and return flat metadata results."""
    return await _yt_flat(f"ytsearch{limit}:{q}", limit)


@router.get("/feed", response_model=list[TrackMeta])
async def get_music_feed(
    limit: int = Query(100, ge=1, le=100),
) -> list[TrackMeta]:
    """Return a mix of tracks from configured genres and playlists."""
    import json
    from backend.database import get_setting

    genres: list[str] = []
    playlists: list[str] = []
    try:
        genres = json.loads(get_setting("audio_genres") or "[]")
    except Exception:
        pass
    try:
        playlists = json.loads(get_setting("audio_playlists") or "[]")
    except Exception:
        pass

    if not genres and not playlists:
        return await _yt_flat("ytsearch20:music", limit)

    tasks: list[Any] = []
    per_source = max(3, limit // max(1, len(genres) + len(playlists)))

    for genre in genres:
        tasks.append(_yt_flat(f"ytsearch{per_source}:{genre} music", per_source))
    for url in playlists:
        tasks.append(_yt_flat(url, per_source))

    results_nested = await asyncio.gather(*tasks, return_exceptions=True)
    combined: list[TrackMeta] = []
    for r in results_nested:
        if isinstance(r, list):
            combined.extend(r)

    random.shuffle(combined)
    seen: set[str] = set()
    deduped: list[TrackMeta] = []
    for t in combined:
        if t.id not in seen:
            seen.add(t.id)
            deduped.append(t)
        if len(deduped) >= limit:
            break
    return deduped


@router.post("/volume", response_model=MusicActionResponse)
async def set_music_volume_endpoint(request: MusicVolumeRequest) -> MusicActionResponse:
    """Set music volume (0-100)."""
    result = await execute_bot_command(request.guild_id, "music volume", str(request.volume), channel_id=request.channel_id)
    return MusicActionResponse(**result)
