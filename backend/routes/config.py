"""Configuration API routes for SlopSoil Web GUI.

Handles settings management and configuration updates.
"""

import logging
import os
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from backend.database import (
    get_all_settings_with_env,
    get_all_users,
    set_setting,
    mark_config_modified,
    _ORIGINAL_ENV_VARS,
)
from backend.services.discord import fetch_discord_avatar

log = logging.getLogger(__name__)
router = APIRouter(prefix="/config")


class ConfigUpdateRequest(BaseModel):
    """Request model for updating configuration."""
    discord_token: str | None = None
    command_prefix: str | None = None
    tvheadend_url: str | None = None
    tvheadend_user: str | None = None
    tvheadend_pass: str | None = None
    jellyfin_url: str | None = None
    jellyfin_api_key: str | None = None
    timezone: str | None = None
    ytdlp_format: str | None = None
    stream_quality: str | None = None
    stream_resolution: str | None = None
    stream_fps: int | None = None
    stream_video_bitrate: str | None = None
    stream_packet_pace: int | None = None
    stream_av_sync_ms: int | None = None


class ConfigResponse(BaseModel):
    """Response model for configuration."""
    settings: dict[str, dict[str, Any]]
    users: list[dict[str, Any]]


class ConfigUpdateResponse(BaseModel):
    """Response model for configuration update."""
    message: str
    updated: str = ""
    skipped: str = ""
    avatar_updated: bool = False


@router.get("", response_model=ConfigResponse)
@router.get("/", response_model=ConfigResponse)
async def get_config() -> ConfigResponse:
    """Get current configuration and users."""
    settings = get_all_settings_with_env()
    users = get_all_users()
    return ConfigResponse(settings=settings, users=users)


@router.post("/", response_model=ConfigUpdateResponse)
async def update_config(request: ConfigUpdateRequest) -> ConfigUpdateResponse:
    """Update configuration settings."""
    settings_map = {
        "discord_token": request.discord_token,
        "command_prefix": request.command_prefix,
        "tvheadend_url": request.tvheadend_url,
        "tvheadend_user": request.tvheadend_user,
        "tvheadend_pass": request.tvheadend_pass,
        "jellyfin_url": request.jellyfin_url,
        "jellyfin_api_key": request.jellyfin_api_key,
        "timezone": request.timezone,
        "ytdlp_format": request.ytdlp_format,
        "stream_quality": request.stream_quality,
        "stream_resolution": request.stream_resolution,
        "stream_fps": str(request.stream_fps) if request.stream_fps is not None else None,
        "stream_video_bitrate": request.stream_video_bitrate,
        "stream_packet_pace": str(request.stream_packet_pace) if request.stream_packet_pace is not None else None,
        "stream_av_sync_ms": str(request.stream_av_sync_ms) if request.stream_av_sync_ms is not None else None,
    }

    updated = []
    skipped_env = []
    avatar_updated = False
    
    for key, value in settings_map.items():
        if value is not None:
            # Check if this setting is controlled by env var
            env_key = key.upper()
            if os.environ.get(env_key) is not None:
                skipped_env.append(key)
                continue
            set_setting(key, value)
            updated.append(key)
            
            # If Discord token was updated and not env-controlled, fetch avatar
            if key == "discord_token":
                # Check if discord_avatar_url is env-controlled
                if "DISCORD_AVATAR_URL" not in _ORIGINAL_ENV_VARS:
                    avatar_url = await fetch_discord_avatar(value)
                    if avatar_url:
                        set_setting("discord_avatar_url", avatar_url)
                        updated.append("discord_avatar_url")
                        avatar_updated = True
                    else:
                        # Clear avatar if no avatar found
                        set_setting("discord_avatar_url", "")
                        updated.append("discord_avatar_url")
                        avatar_updated = True

    # Mark config as modified to trigger reload notification
    if updated:
        mark_config_modified()

    message = f"Updated {len(updated)} settings"
    if skipped_env:
        message += f" (skipped {len(skipped_env)} env-controlled: {', '.join(skipped_env)})"
    if avatar_updated:
        message += " (avatar refreshed)"
    return ConfigUpdateResponse(
        message=message,
        updated=", ".join(updated),
        skipped=", ".join(skipped_env),
        avatar_updated=avatar_updated
    )
