"""Voice channel control API routes for SlopSoil Web GUI.

Handles voice channel management, guild listing, and command execution.
"""

import logging
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from backend.bot_runner import (
    get_bot_guilds,
    get_guild_voice_channels,
    get_bot_voice_status,
    join_voice_channel,
    leave_voice_channel,
    stop_voice_playback,
    execute_bot_command,
)
from backend.services.discord import fetch_discord_user
from backend.auth import get_current_user
from backend.database import get_user_by_user_id

log = logging.getLogger(__name__)
router = APIRouter()


class GuildResponse(BaseModel):
    """Response model for a guild."""
    id: str
    name: str
    icon_url: str | None = None


class GuildsListResponse(BaseModel):
    """Response model for guilds list."""
    guilds: list[GuildResponse]


class VoiceChannelResponse(BaseModel):
    """Response model for a voice channel."""
    id: str
    name: str


class VoiceChannelsResponse(BaseModel):
    """Response model for voice channels."""
    channels: list[VoiceChannelResponse]


class VoiceStatusResponse(BaseModel):
    """Response model for voice connection status."""
    connected: bool
    guild_id: str | None = None
    guild_name: str | None = None
    channel_id: str | None = None
    channel_name: str | None = None


class VoiceJoinRequest(BaseModel):
    """Request model for joining a voice channel."""
    channel_id: str


class VoiceActionResponse(BaseModel):
    """Response model for voice actions."""
    success: bool
    message: str


class CommandExecuteRequest(BaseModel):
    """Request model for executing a bot command."""
    command: str = Field(..., min_length=1)
    args: str = ""
    channel_id: str | None = None


class CommandExecuteResponse(BaseModel):
    """Response model for command execution."""
    success: bool
    message: str
    command: str | None = None
    cog_name: str | None = None
    is_voice: bool = False
    is_video: bool = False
    is_music: bool = False


class DiscordUserLookupResponse(BaseModel):
    """Response model for Discord user lookup."""
    found: bool
    id: str | None = None
    username: str | None = None
    avatar_url: str | None = None
    error: str | None = None


@router.get("/bot/guilds", response_model=GuildsListResponse)
async def get_guilds_endpoint() -> GuildsListResponse:
    """Get list of guilds the bot is connected to."""
    guilds = get_bot_guilds()
    return GuildsListResponse(guilds=[GuildResponse(**g) for g in guilds])


@router.get("/bot/guilds/{guild_id}/channels", response_model=VoiceChannelsResponse)
async def get_guild_channels_endpoint(guild_id: str) -> VoiceChannelsResponse:
    """Get voice channels for a specific guild."""
    channels = get_guild_voice_channels(guild_id)
    if channels is None:
        raise HTTPException(status_code=404, detail="Guild not found")
    return VoiceChannelsResponse(channels=[VoiceChannelResponse(**c) for c in channels])


@router.get("/bot/voice-status", response_model=VoiceStatusResponse)
async def get_voice_status_endpoint() -> VoiceStatusResponse:
    """Get current voice connection status."""
    status = get_bot_voice_status()
    return VoiceStatusResponse(**status)


@router.post("/bot/guilds/{guild_id}/join", response_model=VoiceActionResponse)
async def join_voice_endpoint(guild_id: str, request: VoiceJoinRequest) -> VoiceActionResponse:
    """Join a voice channel in a guild."""
    result = await join_voice_channel(guild_id, request.channel_id)
    return VoiceActionResponse(**result)


@router.post("/bot/guilds/{guild_id}/leave", response_model=VoiceActionResponse)
async def leave_voice_endpoint(guild_id: str) -> VoiceActionResponse:
    """Leave voice channel in a guild."""
    result = await leave_voice_channel(guild_id)
    return VoiceActionResponse(**result)


@router.post("/bot/guilds/{guild_id}/stop", response_model=VoiceActionResponse)
async def stop_playback_endpoint(guild_id: str) -> VoiceActionResponse:
    """Stop voice playback without leaving the channel."""
    result = await stop_voice_playback(guild_id)
    return VoiceActionResponse(**result)


@router.post("/bot/guilds/{guild_id}/execute", response_model=CommandExecuteResponse)
async def execute_command_endpoint(guild_id: str, request: CommandExecuteRequest) -> CommandExecuteResponse:
    """Execute a bot command in a guild."""
    result = await execute_bot_command(guild_id, request.command, request.args, channel_id=request.channel_id)
    return CommandExecuteResponse(**result)


# Discord User Lookup (separate endpoint for Discord API)

@router.get("/bot/discord/lookup/{user_id}", response_model=DiscordUserLookupResponse)
async def lookup_discord_user(user_id: str) -> DiscordUserLookupResponse:
    """Fetch Discord user information by ID."""
    if not user_id.strip().isdigit():
        raise HTTPException(status_code=400, detail="user_id must be numeric")

    result = await fetch_discord_user(user_id.strip())
    return DiscordUserLookupResponse(**result)
