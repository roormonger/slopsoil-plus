"""Local media source API routes for SlopSoil Web GUI.

Handles local directory browsing, media scanning, thumbnail serving,
and direct playback of local media files.
"""

import logging
import os
from typing import Any

from fastapi import APIRouter, HTTPException, Query, Response
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

import discord

import backend.database as db

log = logging.getLogger(__name__)
router = APIRouter(prefix="/local")

_MEDIA_ROOT = "/media"

_AUDIO_EXTS = {".mp3", ".flac", ".ogg", ".m4a", ".wav", ".wma", ".opus", ".aac"}
_VIDEO_EXTS = {".mp4", ".mkv", ".avi", ".mov", ".webm", ".m4v"}
_IMAGE_EXTS = {".jpg", ".jpeg", ".png"}


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


class LocalTrack(BaseModel):
    """A single local audio track."""
    name: str
    path: str
    duration: int = 0


class LocalAlbum(BaseModel):
    """A local album with its tracks."""
    name: str
    path: str
    thumbnail: str = ""
    tracks: list[LocalTrack]


class LocalArtist(BaseModel):
    """A local music artist with albums."""
    name: str
    path: str
    thumbnail: str = ""
    albums: list[LocalAlbum]


class LocalMusicResponse(BaseModel):
    """Response for local music scan."""
    artists: list[LocalArtist]


class LocalVideo(BaseModel):
    """A single local video file."""
    name: str
    path: str
    thumbnail: str = ""


class LocalVideoResponse(BaseModel):
    """Response for local video scan."""
    videos: list[LocalVideo]


class LocalPlayRequest(BaseModel):
    """Request model for playing local media."""
    guild_id: str = Field(..., min_length=1)
    path: str = Field(..., min_length=1)
    title: str = ""
    thumbnail: str = ""
    channel_id: str | None = None


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


# ─── Media scanning ───────────────────────────────────────────────────────────


def _is_audio_file(name: str) -> bool:
    return any(name.lower().endswith(ext) for ext in _AUDIO_EXTS)


def _is_video_file(name: str) -> bool:
    return any(name.lower().endswith(ext) for ext in _VIDEO_EXTS)


def _find_image(root: str, *names: str) -> str:
    """Look for an image file by name(s) in root. Return relative thumb URL or empty."""
    for n in names:
        for ext in _IMAGE_EXTS:
            p = os.path.join(root, n + ext)
            if os.path.isfile(p):
                return f"/api/local/thumb?path={p}"
    return ""


def _find_sidecar_image(video_path: str) -> str:
    """Look for a jpg/png with the same basename as the video."""
    base = os.path.splitext(video_path)[0]
    for ext in _IMAGE_EXTS:
        p = base + ext
        if os.path.isfile(p):
            return f"/api/local/thumb?path={p}"
    return ""


@router.get("/music", response_model=LocalMusicResponse)
async def scan_local_music() -> LocalMusicResponse:
    """Scan all enabled music sources and build artist/album/track tree."""
    sources = db.get_local_sources()
    artists: list[LocalArtist] = []

    for src in sources:
        if not src.get("enabled") or src.get("type") != "music":
            continue
        root = src["path"]
        if not os.path.isdir(root):
            continue

        for artist_name in sorted(os.listdir(root)):
            artist_path = os.path.join(root, artist_name)
            if not os.path.isdir(artist_path) or artist_name.startswith("."):
                continue

            artist_thumb = _find_image(artist_path, "folder")
            albums: list[LocalAlbum] = []

            for album_name in sorted(os.listdir(artist_path)):
                album_path = os.path.join(artist_path, album_name)
                if not os.path.isdir(album_path) or album_name.startswith("."):
                    continue

                album_thumb = _find_image(album_path, "cover")
                tracks: list[LocalTrack] = []

                for track_name in sorted(os.listdir(album_path)):
                    track_path = os.path.join(album_path, track_name)
                    if not os.path.isfile(track_path) or track_name.startswith("."):
                        continue
                    if _is_audio_file(track_name):
                        tracks.append(LocalTrack(
                            name=track_name,
                            path=track_path,
                            duration=0,
                        ))

                if tracks:
                    albums.append(LocalAlbum(
                        name=album_name,
                        path=album_path,
                        thumbnail=album_thumb,
                        tracks=tracks,
                    ))

            if albums:
                artists.append(LocalArtist(
                    name=artist_name,
                    path=artist_path,
                    thumbnail=artist_thumb,
                    albums=albums,
                ))

    return LocalMusicResponse(artists=artists)


@router.get("/video", response_model=LocalVideoResponse)
async def scan_local_video() -> LocalVideoResponse:
    """Scan all enabled video sources and return a flat list of video files."""
    sources = db.get_local_sources()
    videos: list[LocalVideo] = []

    for src in sources:
        if not src.get("enabled") or src.get("type") != "video":
            continue
        root = src["path"]
        max_depth = src.get("scan_depth", 0)
        if not os.path.isdir(root):
            continue

        def _walk(path: str, depth: int) -> None:
            if depth > max_depth:
                return
            try:
                entries = sorted(os.listdir(path))
            except OSError:
                return
            for name in entries:
                if name.startswith("."):
                    continue
                full = os.path.join(path, name)
                if os.path.isdir(full) and depth < max_depth:
                    _walk(full, depth + 1)
                elif os.path.isfile(full) and _is_video_file(name):
                    videos.append(LocalVideo(
                        name=name,
                        path=full,
                        thumbnail=_find_sidecar_image(full),
                    ))

        _walk(root, 0)

    return LocalVideoResponse(videos=videos)


@router.get("/thumb")
async def serve_thumbnail(path: str = Query(..., min_length=1)) -> Response:
    """Serve a local image file (thumbnail)."""
    resolved = _resolve_media_path(path)
    if not os.path.isfile(resolved):
        raise HTTPException(status_code=404, detail="Image not found")
    ext = os.path.splitext(resolved)[1].lower()
    media_type = "image/jpeg" if ext in (".jpg", ".jpeg") else "image/png" if ext == ".png" else "application/octet-stream"
    return FileResponse(resolved, media_type=media_type, headers={"Cache-Control": "public, max-age=86400"})


# ─── Direct playback ─────────────────────────────────────────────────────────


@router.post("/play-audio")
async def play_local_audio(request: LocalPlayRequest) -> dict[str, Any]:
    """Play a local audio file directly (bypasses Discord command parsing)."""
    from backend.bot_runner import get_bot_instance, join_voice_channel

    bot = get_bot_instance()
    if bot is None:
        raise HTTPException(status_code=503, detail="Bot is not running")

    guild = bot.get_guild(int(request.guild_id))
    if guild is None:
        raise HTTPException(status_code=404, detail="Guild not found")

    # Ensure voice connection
    vc = guild.voice_client
    if request.channel_id:
        target = guild.get_channel(int(request.channel_id))
        if target and isinstance(target, discord.VoiceChannel):
            if not vc or not vc.is_connected():
                result = await join_voice_channel(request.guild_id, request.channel_id)
                if not result["success"]:
                    raise HTTPException(status_code=400, detail=result["message"])
                vc = guild.voice_client
            elif vc.channel and vc.channel.id != int(request.channel_id):
                await vc.move_to(target)

    if not vc or not vc.is_connected():
        raise HTTPException(status_code=400, detail="Bot is not in a voice channel")

    music_cog = bot.get_cog("Music")
    if music_cog is None:
        raise HTTPException(status_code=503, detail="Music cog not loaded")

    from cogs.music import MusicTrack

    title = request.title or os.path.basename(request.path)
    track = MusicTrack(
        url=request.path,
        title=title,
        duration=0,
        thumbnail=request.thumbnail,
        requested_by="Web UI",
        webpage_url="",
    )

    # If something is already playing, add to queue
    if vc.is_playing() and guild.id in bot.music_current:
        queue = music_cog._get_queue(guild.id)
        queue.append(track)
        return {"success": True, "message": f"Added to queue: {title}"}

    await music_cog._play_track(guild.id, vc, track)
    return {"success": True, "message": f"Playing: {title}"}


@router.post("/play-video")
async def play_local_video(request: LocalPlayRequest) -> dict[str, Any]:
    """Play a local video file directly (bypasses Discord command parsing)."""
    import discord
    from cogs.stream import start_stream
    from backend.bot_runner import get_bot_instance, join_voice_channel

    bot = get_bot_instance()
    if bot is None:
        raise HTTPException(status_code=503, detail="Bot is not running")

    guild = bot.get_guild(int(request.guild_id))
    if guild is None:
        raise HTTPException(status_code=404, detail="Guild not found")

    if not request.channel_id:
        raise HTTPException(status_code=400, detail="Voice channel ID required")

    voice_channel = guild.get_channel(int(request.channel_id))
    if voice_channel is None or not isinstance(voice_channel, discord.VoiceChannel):
        raise HTTPException(status_code=404, detail="Voice channel not found")

    vc = guild.voice_client
    if not vc or not vc.is_connected():
        result = await join_voice_channel(request.guild_id, request.channel_id)
        if not result["success"]:
            raise HTTPException(status_code=400, detail=result["message"])
        vc = guild.voice_client
    elif vc.channel and vc.channel.id != int(request.channel_id):
        await vc.move_to(voice_channel)

    title = request.title or os.path.basename(request.path)

    async def _noop_send(msg: str, **kwargs: Any) -> None:
        pass

    await start_stream(
        bot=bot,
        send=_noop_send,
        guild=guild,
        voice_channel=voice_channel,
        vc=vc,
        title=title,
        url=request.path,
        live=False,
        audio=True,
    )
    return {"success": True, "message": f"Playing: {title}"}
