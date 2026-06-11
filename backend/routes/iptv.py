"""IPTV API routes for SlopSoil Web GUI.

Handles IPTV source management and M3U playlist handling.
"""

import hashlib
import logging
import urllib.request
from typing import Any

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field

import backend.database as db

log = logging.getLogger(__name__)
router = APIRouter(prefix="/iptv")

# Simple in-memory cache: url_hash -> (content_type, bytes)
_logo_cache: dict[str, tuple[str, bytes]] = {}
_MAX_CACHE = 2000


@router.get("/logo-proxy")
async def logo_proxy(url: str) -> Response:
    """Proxy an external logo image to avoid browser CORS issues."""
    if not url.startswith(("http://", "https://")):
        raise HTTPException(status_code=400, detail="Invalid URL")

    key = hashlib.md5(url.encode()).hexdigest()
    if key in _logo_cache:
        ct, data = _logo_cache[key]
        return Response(content=data, media_type=ct, headers={"Cache-Control": "public, max-age=86400"})

    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=8) as resp:
            ct = resp.headers.get_content_type() or "image/png"
            data = resp.read(512 * 1024)  # cap at 512 KB
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Could not fetch logo: {exc}")

    if len(_logo_cache) < _MAX_CACHE:
        _logo_cache[key] = (ct, data)

    return Response(content=data, media_type=ct, headers={"Cache-Control": "public, max-age=86400"})


class IPTVSourceResponse(BaseModel):
    """Response model for an IPTV source."""
    name: str
    url: str
    enabled: bool
    channel_count: int


class IPTVChannelResponse(BaseModel):
    """Response model for an IPTV channel."""
    name: str
    tvg_id: str | None = None
    group: str | None = None
    stream_url: str
    logo_url: str | None = None


class IPTVSourceAddRequest(BaseModel):
    """Request model for adding an IPTV source."""
    name: str = Field(..., min_length=1)
    url: str = Field(..., min_length=1)


@router.get("/sources", response_model=list[IPTVSourceResponse])
async def get_iptv_sources() -> list[IPTVSourceResponse]:
    """Get all IPTV sources."""
    sources = db.get_iptv_sources()
    return [
        IPTVSourceResponse(
            name=src["name"],
            url=src["url"],
            enabled=src.get("enabled", True),
            channel_count=len(src.get("channels", [])),
        )
        for src in sources
    ]


@router.post("/sources")
async def add_iptv_source(request: IPTVSourceAddRequest) -> dict[str, Any]:
    """Add a new IPTV source by fetching and parsing the M3U playlist."""
    from cogs.iptv import fetch_and_parse
    try:
        channels, epg_url = await fetch_and_parse(request.url)
        db.upsert_iptv_source(request.name, request.url, channels, epg_url=epg_url)
        return {
            "message": f"Added source '{request.name}' with {len(channels)} channels",
            "name": request.name,
            "channel_count": len(channels),
        }
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Failed to add source: {exc}")


@router.post("/sources/upload")
async def upload_iptv_source(
    name: str = Field(..., min_length=1),
    file: UploadFile = File(...),
) -> dict[str, Any]:
    """Upload and parse an M3U playlist file."""
    from cogs.iptv import parse_m3u, _get_epg_url
    try:
        text = (await file.read()).decode("utf-8", errors="replace")
        channels = parse_m3u(text)
        epg_url = _get_epg_url(text)
        url = f"file://{file.filename or 'upload'}"
        db.upsert_iptv_source(name, url, channels, epg_url=epg_url)
        return {
            "message": f"Added source '{name}' with {len(channels)} channels",
            "name": name,
            "channel_count": len(channels),
        }
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid M3U file: {exc}")
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Failed to process file: {exc}")


@router.delete("/sources/{name}")
async def delete_iptv_source(name: str) -> dict[str, str]:
    """Remove an IPTV source by name."""
    deleted = db.delete_iptv_source(name)
    if not deleted:
        raise HTTPException(status_code=404, detail="Source not found")
    return {"message": f"Removed source '{name}'"}


@router.get("/sources/{name}/channels", response_model=list[IPTVChannelResponse])
async def get_iptv_channels(name: str) -> list[IPTVChannelResponse]:
    """Get all channels for a specific IPTV source."""
    sources = db.get_iptv_sources()
    for src in sources:
        if src["name"].lower() == name.lower():
            return [
                IPTVChannelResponse(
                    name=ch.get("name", "Unknown"),
                    tvg_id=ch.get("tvg_id") or None,
                    group=ch.get("group") or None,
                    stream_url=ch.get("stream_url", ""),
                    logo_url=ch.get("logo_url") or None,
                )
                for ch in src.get("channels", [])
            ]
    raise HTTPException(status_code=404, detail="Source not found")


@router.post("/sources/{name}/toggle")
async def toggle_iptv_source(name: str) -> dict[str, Any]:
    """Toggle enable/disable state of an IPTV source."""
    sources = db.get_iptv_sources()
    for src in sources:
        if src["name"].lower() == name.lower():
            new_state = not src.get("enabled", True)
            db.set_iptv_source_enabled(src["name"], new_state)
            return {
                "message": f"Source '{src['name']}' {'enabled' if new_state else 'disabled'}",
                "enabled": new_state,
            }
    raise HTTPException(status_code=404, detail="Source not found")
