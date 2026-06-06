"""IPTV API routes for SlopSoil Web GUI.

Handles IPTV source management and M3U playlist handling.
"""

import logging
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from backend.bot_runner import get_source_manager

log = logging.getLogger(__name__)
router = APIRouter(prefix="/iptv")


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


class IPTVSourceAddRequest(BaseModel):
    """Request model for adding an IPTV source."""
    name: str = Field(..., min_length=1)
    url: str = Field(..., min_length=1)


@router.get("/sources", response_model=list[IPTVSourceResponse])
async def get_iptv_sources() -> list[IPTVSourceResponse]:
    """Get all IPTV sources from SourceManager."""
    sm = get_source_manager()
    if sm is None:
        return []
    sources = sm.get_sources()
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
    sm = get_source_manager()
    if sm is None:
        raise HTTPException(status_code=503, detail="SourceManager not available")
    try:
        channels, epg_url = await fetch_and_parse(request.url)
        sm.add_source(request.name, request.url, channels, epg_url=epg_url)
        return {
            "message": f"Added source '{request.name}' with {len(channels)} channels",
            "name": request.name,
            "channel_count": len(channels),
        }
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Failed to add source: {exc}")


@router.delete("/sources/{name}")
async def delete_iptv_source(name: str) -> dict[str, str]:
    """Remove an IPTV source by name."""
    sm = get_source_manager()
    if sm is None:
        raise HTTPException(status_code=503, detail="SourceManager not available")
    sources = sm.get_sources()
    for i, src in enumerate(sources):
        if src["name"].lower() == name.lower():
            removed_name = sm.remove_source(i)
            return {"message": f"Removed source '{removed_name}'"}
    raise HTTPException(status_code=404, detail="Source not found")


@router.get("/sources/{name}/channels", response_model=list[IPTVChannelResponse])
async def get_iptv_channels(name: str) -> list[IPTVChannelResponse]:
    """Get all channels for a specific IPTV source."""
    sm = get_source_manager()
    if sm is None:
        raise HTTPException(status_code=503, detail="SourceManager not available")
    sources = sm.get_sources()
    for src in sources:
        if src["name"].lower() == name.lower():
            channels = src.get("channels", [])
            return [
                IPTVChannelResponse(
                    name=ch.get("name", "Unknown"),
                    tvg_id=ch.get("tvg_id") or None,
                    group=ch.get("group") or None,
                    stream_url=ch.get("stream_url", ""),
                )
                for ch in channels
            ]
    raise HTTPException(status_code=404, detail="Source not found")


@router.post("/sources/{name}/toggle")
async def toggle_iptv_source(name: str) -> dict[str, Any]:
    """Toggle enable/disable state of an IPTV source."""
    sm = get_source_manager()
    if sm is None:
        raise HTTPException(status_code=503, detail="SourceManager not available")
    sources = sm.get_sources()
    for i, src in enumerate(sources):
        if src["name"].lower() == name.lower():
            new_state = not src.get("enabled", True)
            sm.set_enabled(i, new_state)
            return {
                "message": f"Source '{src['name']}' {'enabled' if new_state else 'disabled'}",
                "enabled": new_state,
            }
    raise HTTPException(status_code=404, detail="Source not found")
