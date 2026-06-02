"""FastAPI routes for SlopSoil Web GUI."""

from __future__ import annotations

import bcrypt
import json
import logging
import sys
from pathlib import Path
from typing import Any

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from backend.database import (
    get_all_settings,
    mark_config_modified,
    set_setting,
    create_user,
    get_user_by_user_id,
    get_user_by_username,
    get_user_by_discord_id,
    update_user,
    delete_user as db_delete_user,
    get_all_users,
    update_user_bookmarks,
)
from backend.bot_runner import (
    fetch_discord_user,
    get_bot_guilds,
    get_bot_status,
    get_bot_voice_status,
    get_guild_voice_channels,
    get_now_playing,
    get_pending_reload_status,
    join_voice_channel,
    leave_voice_channel,
    reload_bot,
    execute_bot_command,
)

router = APIRouter()
log = logging.getLogger(__name__)


# Request/Response models

class ConfigResponse(BaseModel):
    settings: dict[str, str]
    users: list[dict[str, Any]]


class ConfigUpdateRequest(BaseModel):
    discord_token: str | None = None
    command_prefix: str | None = None
    tvheadend_url: str | None = None
    tvheadend_user: str | None = None
    tvheadend_pass: str | None = None
    jellyfin_url: str | None = None
    jellyfin_api_key: str | None = None
    timezone: str | None = None


# User system models

class UserResponse(BaseModel):
    user_id: str
    username: str
    avatar: str | None = None
    discord_id: str | None = None
    role: str
    bookmarks_video: list[dict[str, Any]] = []
    bookmarks_voice: list[dict[str, Any]] = []
    created_at: str
    updated_at: str


class UserCreateRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    password: str = Field(..., min_length=6)
    role: str = Field(default="user", pattern="^(admin|user)$")
    avatar: str | None = None
    discord_id: str | None = None


class UserUpdateRequest(BaseModel):
    username: str | None = Field(None, min_length=3, max_length=50)
    avatar: str | None = None
    discord_id: str | None = None
    role: str | None = Field(None, pattern="^(admin|user)$")
    bookmarks_video: list[dict[str, Any]] | None = None
    bookmarks_voice: list[dict[str, Any]] | None = None




class DiscordUserLookupResponse(BaseModel):
    found: bool
    id: str | None = None
    username: str | None = None
    avatar_url: str | None = None
    error: str | None = None


class BotInfo(BaseModel):
    id: str
    name: str
    avatar_url: str | None = None


class BotStatusResponse(BaseModel):
    status: str
    running: bool
    has_token: bool
    user_count: int
    streaming_count: int = 0
    guild_count: int = 0
    bot: BotInfo | None = None


class NowPlayingResponse(BaseModel):
    streams: list[dict[str, Any]]
    count: int


class ReloadResponse(BaseModel):
    success: bool
    message: str


class PendingReloadResponse(BaseModel):
    needs_reload: bool
    last_modified: str


# API Endpoints

@router.get("/api/config", response_model=ConfigResponse)
async def get_config() -> ConfigResponse:
    """Get current configuration and users."""
    settings = get_all_settings()
    users = get_all_users()
    return ConfigResponse(settings=settings, users=users)


@router.post("/api/config")
async def update_config(request: ConfigUpdateRequest) -> dict[str, str]:
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
    }

    updated = []
    for key, value in settings_map.items():
        if value is not None:
            set_setting(key, value)
            updated.append(key)

    # Mark config as modified to trigger reload notification
    if updated:
        mark_config_modified()

    return {"message": f"Updated {len(updated)} settings", "updated": ", ".join(updated)}




@router.get("/api/discord/lookup/{user_id}", response_model=DiscordUserLookupResponse)
async def lookup_discord_user(user_id: str) -> DiscordUserLookupResponse:
    """Fetch Discord user information by ID."""
    if not user_id.strip().isdigit():
        raise HTTPException(status_code=400, detail="user_id must be numeric")

    result = await fetch_discord_user(user_id.strip())
    return DiscordUserLookupResponse(**result)




@router.get("/api/bot/status", response_model=BotStatusResponse)
async def get_status() -> BotStatusResponse:
    """Get current bot status."""
    return BotStatusResponse(**get_bot_status())


@router.post("/api/bot/reload", response_model=ReloadResponse)
async def reload_bot_endpoint() -> ReloadResponse:
    """Hot-reload the Discord bot with fresh configuration."""
    success = await reload_bot()
    if success:
        return ReloadResponse(success=True, message="Bot reloaded successfully")
    else:
        return ReloadResponse(success=False, message="Failed to reload bot. Check logs and ensure Discord token is configured.")


@router.get("/api/now-playing", response_model=NowPlayingResponse)
async def get_now_playing_endpoint() -> NowPlayingResponse:
    """Get currently playing streams."""
    return NowPlayingResponse(**get_now_playing())


@router.get("/api/bot/pending-reload", response_model=PendingReloadResponse)
async def get_pending_reload_endpoint() -> PendingReloadResponse:
    """Check if bot needs reload due to config changes."""
    return PendingReloadResponse(**get_pending_reload_status())


# IPTV Sources API

class IPTVSourceResponse(BaseModel):
    name: str
    url: str
    enabled: bool
    channel_count: int


class IPTVSourceAddRequest(BaseModel):
    name: str = Field(..., min_length=1)
    url: str = Field(..., min_length=1)


@router.get("/api/iptv/sources", response_model=list[IPTVSourceResponse])
async def get_iptv_sources() -> list[IPTVSourceResponse]:
    """Get all IPTV sources from SourceManager."""
    from backend.bot_runner import get_source_manager
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


@router.post("/api/iptv/sources")
async def add_iptv_source(request: IPTVSourceAddRequest) -> dict[str, Any]:
    """Add a new IPTV source by fetching and parsing the M3U playlist."""
    from backend.bot_runner import get_source_manager
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


@router.delete("/api/iptv/sources/{name}")
async def delete_iptv_source(name: str) -> dict[str, str]:
    """Remove an IPTV source by name."""
    from backend.bot_runner import get_source_manager
    sm = get_source_manager()
    if sm is None:
        raise HTTPException(status_code=503, detail="SourceManager not available")
    sources = sm.get_sources()
    for i, src in enumerate(sources):
        if src["name"].lower() == name.lower():
            removed_name = sm.remove_source(i)
            return {"message": f"Removed source '{removed_name}'"}
    raise HTTPException(status_code=404, detail="Source not found")


@router.post("/api/iptv/sources/{name}/toggle")
async def toggle_iptv_source(name: str) -> dict[str, Any]:
    """Toggle enable/disable state of an IPTV source."""
    from backend.bot_runner import get_source_manager
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


# Bookmarks API

class BookmarkResponse(BaseModel):
    id: int
    name: str
    url: str
    enabled: bool


class BookmarkAddRequest(BaseModel):
    name: str = Field(..., min_length=1)
    url: str = Field(..., min_length=1)


@router.get("/api/bookmarks", response_model=list[BookmarkResponse])
async def get_bookmarks_endpoint() -> list[BookmarkResponse]:
    """Get all bookmarks."""
    from backend.database import get_bookmarks
    bookmarks = get_bookmarks()
    return [BookmarkResponse(**bm) for bm in bookmarks]


@router.post("/api/bookmarks")
async def add_bookmark_endpoint(request: BookmarkAddRequest) -> dict[str, Any]:
    """Add a new bookmark."""
    from backend.database import add_bookmark
    try:
        add_bookmark(request.name, request.url)
        return {"message": f"Added bookmark '{request.name}'", "name": request.name}
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Failed to add bookmark: {exc}")


@router.delete("/api/bookmarks/{bookmark_id}")
async def delete_bookmark_endpoint(bookmark_id: int) -> dict[str, str]:
    """Delete a bookmark by ID."""
    from backend.database import delete_bookmark
    success = delete_bookmark(bookmark_id)
    if not success:
        raise HTTPException(status_code=404, detail="Bookmark not found")
    return {"message": "Bookmark deleted"}


@router.post("/api/bookmarks/{bookmark_id}/toggle")
async def toggle_bookmark_endpoint(bookmark_id: int) -> dict[str, Any]:
    """Toggle enable/disable state of a bookmark."""
    from backend.database import get_bookmarks, set_bookmark_enabled
    bookmarks = get_bookmarks()
    for bm in bookmarks:
        if bm["id"] == bookmark_id:
            new_state = not bm["enabled"]
            set_bookmark_enabled(bookmark_id, new_state)
            return {
                "message": f"Bookmark '{bm['name']}' {'enabled' if new_state else 'disabled'}",
                "enabled": new_state,
            }
    raise HTTPException(status_code=404, detail="Bookmark not found")


# Bot Control - Guild and Voice Management

class GuildResponse(BaseModel):
    id: str
    name: str
    icon_url: str | None = None


class GuildsListResponse(BaseModel):
    guilds: list[GuildResponse]


class VoiceChannelResponse(BaseModel):
    id: str
    name: str


class VoiceChannelsResponse(BaseModel):
    channels: list[VoiceChannelResponse]


class VoiceStatusResponse(BaseModel):
    connected: bool
    guild_id: str | None = None
    guild_name: str | None = None
    channel_id: str | None = None
    channel_name: str | None = None


class VoiceJoinRequest(BaseModel):
    channel_id: str


class VoiceActionResponse(BaseModel):
    success: bool
    message: str


class CommandExecuteRequest(BaseModel):
    command: str = Field(..., min_length=1)
    args: str = ""


class CommandExecuteResponse(BaseModel):
    success: bool
    message: str


@router.get("/api/bot/guilds", response_model=GuildsListResponse)
async def get_guilds_endpoint() -> GuildsListResponse:
    """Get list of guilds the bot is connected to."""
    guilds = get_bot_guilds()
    return GuildsListResponse(guilds=[GuildResponse(**g) for g in guilds])


@router.get("/api/bot/guilds/{guild_id}/channels", response_model=VoiceChannelsResponse)
async def get_guild_channels_endpoint(guild_id: str) -> VoiceChannelsResponse:
    """Get voice channels for a specific guild."""
    channels = get_guild_voice_channels(guild_id)
    if channels is None:
        raise HTTPException(status_code=404, detail="Guild not found")
    return VoiceChannelsResponse(channels=[VoiceChannelResponse(**c) for c in channels])


@router.get("/api/bot/voice-status", response_model=VoiceStatusResponse)
async def get_voice_status_endpoint() -> VoiceStatusResponse:
    """Get current voice connection status."""
    status = get_bot_voice_status()
    return VoiceStatusResponse(**status)


@router.post("/api/bot/guilds/{guild_id}/join", response_model=VoiceActionResponse)
async def join_voice_endpoint(guild_id: str, request: VoiceJoinRequest) -> VoiceActionResponse:
    """Join a voice channel in a guild."""
    result = await join_voice_channel(guild_id, request.channel_id)
    return VoiceActionResponse(**result)


@router.post("/api/bot/guilds/{guild_id}/leave", response_model=VoiceActionResponse)
async def leave_voice_endpoint(guild_id: str) -> VoiceActionResponse:
    """Leave voice channel in a guild."""
    result = await leave_voice_channel(guild_id)
    return VoiceActionResponse(**result)


@router.post("/api/bot/guilds/{guild_id}/execute", response_model=CommandExecuteResponse)
async def execute_command_endpoint(guild_id: str, request: CommandExecuteRequest) -> CommandExecuteResponse:
    """Execute a bot command in a guild."""
    result = await execute_bot_command(guild_id, request.command, request.args)
    return CommandExecuteResponse(**result)


# Music API

class MusicTrackResponse(BaseModel):
    url: str
    title: str
    duration: int
    thumbnail: str
    requested_by: str
    webpage_url: str


class MusicStatusResponse(BaseModel):
    current: MusicTrackResponse | None = None
    queue: list[MusicTrackResponse]
    queue_length: int
    volume: float
    is_playing: bool
    is_paused: bool


class MusicPlayRequest(BaseModel):
    guild_id: str = Field(..., min_length=1)
    query: str = Field(..., min_length=1)


class MusicControlRequest(BaseModel):
    guild_id: str = Field(..., min_length=1)
    action: str = Field(..., pattern="^(stop|skip|back|pause|resume)$")


class MusicVolumeRequest(BaseModel):
    guild_id: str = Field(..., min_length=1)
    volume: int = Field(..., ge=0, le=100)


class MusicActionResponse(BaseModel):
    success: bool
    message: str


@router.get("/api/music/status", response_model=MusicStatusResponse)
async def get_music_status_endpoint() -> MusicStatusResponse:
    """Get current music playback status."""
    from backend.bot_runner import get_bot_instance, _load_config_from_db
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
    # In a multi-guild setup, we'd need to track which guild the user is interacting with
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


@router.post("/api/music/play", response_model=MusicActionResponse)
async def play_music_endpoint(request: MusicPlayRequest) -> MusicActionResponse:
    """Play or queue music in a guild."""
    result = await execute_bot_command(request.guild_id, "music", request.query)
    return MusicActionResponse(**result)


@router.post("/api/music/control", response_model=MusicActionResponse)
async def control_music_endpoint(request: MusicControlRequest) -> MusicActionResponse:
    """Control music playback (stop, skip, back, pause, resume)."""
    result = await execute_bot_command(request.guild_id, f"music {request.action}", "")
    return MusicActionResponse(**result)


@router.post("/api/music/volume", response_model=MusicActionResponse)
async def set_music_volume_endpoint(request: MusicVolumeRequest) -> MusicActionResponse:
    """Set music volume (0-100)."""
    result = await execute_bot_command(request.guild_id, "music volume", str(request.volume))
    return MusicActionResponse(**result)


# Jellyfin API

class JellyfinLibraryResponse(BaseModel):
    Name: str
    Id: str
    Type: str
    CollectionType: str


class JellyfinItemResponse(BaseModel):
    Id: str
    Name: str
    Type: str
    ProductionYear: int | None = None
    PremiereDate: str | None = None
    CommunityRating: float | None = None
    RunTimeTicks: int | None = None
    Overview: str | None = None
    ImageTags: dict[str, str] | None = None
    UserData: dict[str, Any] | None = None


@router.get("/api/jellyfin/libraries", response_model=list[JellyfinLibraryResponse])
async def get_jellyfin_libraries_endpoint() -> list[JellyfinLibraryResponse]:
    """Get Jellyfin media libraries."""
    from backend.bot_runner import get_bot_instance, _load_config_from_db
    bot = get_bot_instance()
    if bot is None:
        return []

    # Get Jellyfin config from database
    config = _load_config_from_db()
    if not config.get("jellyfin", {}).get("url") or not config.get("jellyfin", {}).get("api_key"):
        return []

    try:
        import aiohttp
        
        headers = {
            "Authorization": f'MediaBrowser Token="{config["jellyfin"]["api_key"]}"',
            "Content-Type": "application/json",
            "Accept": "application/json"
        }
        
        async with aiohttp.ClientSession() as session:
            # Get user ID first (required for some Jellyfin endpoints)
            user_url = f"{config['jellyfin']['url'].rstrip('/')}/Users"
            async with session.get(user_url, headers=headers) as user_response:
                if user_response.status != 200:
                    log.error(f"Failed to fetch Jellyfin users: {user_response.status}")
                    return []
                users_data = await user_response.json()
                if not users_data:
                    log.error("No users found in Jellyfin")
                    return []
                user_id = users_data[0]["Id"]
            
            # Get libraries using the user ID
            url = f"{config['jellyfin']['url'].rstrip('/')}/Users/{user_id}/Views"
            async with session.get(url, headers=headers) as response:
                if response.status == 200:
                    data = await response.json()
                    return [
                        JellyfinLibraryResponse(
                            Name=item.get("Name", ""),
                            Id=item.get("Id", ""),
                            Type=item.get("Type", ""),
                            CollectionType=item.get("CollectionType", "")
                        )
                        for item in data.get("Items", [])
                    ]
                else:
                    log.error(f"Jellyfin API returned status {response.status}")
                    return []
    except Exception as e:
        log.error(f"Failed to fetch Jellyfin libraries: {e}")
        return []


@router.get("/api/jellyfin/items/{library_id}", response_model=list[JellyfinItemResponse])
async def get_jellyfin_items_endpoint(
    library_id: str,
    sort_by: str = "Name",
    sort_order: str = "Ascending",
    search: str = ""
) -> list[JellyfinItemResponse]:
    """Get items from a Jellyfin library."""
    from backend.bot_runner import get_bot_instance, _load_config_from_db
    bot = get_bot_instance()
    if bot is None:
        return []

    # Get Jellyfin config from database
    config = _load_config_from_db()
    if not config.get("jellyfin", {}).get("url") or not config.get("jellyfin", {}).get("api_key"):
        return []

    try:
        import aiohttp
        
        headers = {
            "Authorization": f'MediaBrowser Token="{config["jellyfin"]["api_key"]}"',
            "Content-Type": "application/json",
            "Accept": "application/json"
        }
        
        async with aiohttp.ClientSession() as session:
            # Get user ID first (required for some Jellyfin endpoints)
            user_url = f"{config['jellyfin']['url'].rstrip('/')}/Users"
            async with session.get(user_url, headers=headers) as user_response:
                if user_response.status != 200:
                    log.error(f"Failed to fetch Jellyfin users: {user_response.status}")
                    return []
                users_data = await user_response.json()
                if not users_data:
                    log.error("No users found in Jellyfin")
                    return []
                user_id = users_data[0]["Id"]
            
            # Build items URL with filters
            params = {
                "SortBy": sort_by,
                "SortOrder": sort_order,
                "Recursive": "true",
                "Fields": "Overview,CommunityRating,RunTimeTicks,UserData",
                "IncludeItemTypes": "Movie,Series,Episode,MusicAlbum,MusicArtist,Book"
            }
            
            if search:
                params["SearchTerm"] = search
                params["EnableSearch"] = "true"
            
            items_url = f"{config['jellyfin']['url'].rstrip('/')}/Users/{user_id}/Items"
            if library_id != "all":
                params["ParentId"] = library_id
            
            async with session.get(items_url, headers=headers, params=params) as response:
                if response.status == 200:
                    data = await response.json()
                    return [
                        JellyfinItemResponse(
                            Id=item.get("Id", ""),
                            Name=item.get("Name", ""),
                            Type=item.get("Type", ""),
                            ProductionYear=item.get("ProductionYear"),
                            PremiereDate=item.get("PremiereDate"),
                            CommunityRating=item.get("CommunityRating"),
                            RunTimeTicks=item.get("RunTimeTicks"),
                            Overview=item.get("Overview"),
                            ImageTags=item.get("ImageTags"),
                            UserData=item.get("UserData")
                        )
                        for item in data.get("Items", [])
                    ]
                else:
                    log.error(f"Jellyfin items API returned status {response.status}")
                    return []
    except Exception as e:
        log.error(f"Failed to fetch Jellyfin items: {e}")
        return []


# User Management API Routes

@router.get("/api/users", response_model=list[UserResponse])
async def get_users(role: str | None = None):
    """Get all users, optionally filtered by role."""
    try:
        users = get_all_users(role_filter=role)
        return [UserResponse(**user) for user in users]
    except Exception as e:
        log.error(f"Failed to get users: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve users")


@router.post("/api/users", response_model=UserResponse)
async def create_new_user(user_request: UserCreateRequest):
    """Create a new user."""
    try:
        # Check if username already exists
        existing_user = get_user_by_username(user_request.username)
        if existing_user:
            raise HTTPException(status_code=400, detail="Username already exists")
        
        # Check if Discord ID already exists (if provided)
        if user_request.discord_id:
            existing_discord_user = get_user_by_discord_id(user_request.discord_id)
            if existing_discord_user:
                raise HTTPException(status_code=400, detail="Discord ID already exists")
        
        # Hash password using bcrypt
        password_hash = bcrypt.hashpw(user_request.password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
        
        user_id = create_user(
            username=user_request.username,
            password_hash=password_hash,
            role=user_request.role,
            avatar=user_request.avatar,
            discord_id=user_request.discord_id
        )
        
        user = get_user_by_user_id(user_id)
        if not user:
            raise HTTPException(status_code=500, detail="Failed to create user")
        
        return UserResponse(**user)
    except HTTPException:
        raise
    except Exception as e:
        log.error(f"Failed to create user: {e}")
        raise HTTPException(status_code=500, detail="Failed to create user")


@router.get("/api/users/{user_id}", response_model=UserResponse)
async def get_user(user_id: str):
    """Get user by ID."""
    try:
        user = get_user_by_user_id(user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        return UserResponse(**user)
    except HTTPException:
        raise
    except Exception as e:
        log.error(f"Failed to get user: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve user")


@router.put("/api/users/{user_id}", response_model=UserResponse)
async def update_user_endpoint(user_id: str, user_request: UserUpdateRequest):
    """Update user by ID."""
    try:
        # Check if user exists
        existing_user = get_user_by_user_id(user_id)
        if not existing_user:
            raise HTTPException(status_code=404, detail="User not found")
        
        # Prepare update data
        update_data = {}
        if user_request.username is not None:
            # Check if new username is already taken by another user
            other_user = get_user_by_username(user_request.username)
            if other_user and other_user['user_id'] != user_id:
                raise HTTPException(status_code=400, detail="Username already exists")
            update_data['username'] = user_request.username
        
        if user_request.avatar is not None:
            update_data['avatar'] = user_request.avatar
        
        if user_request.discord_id is not None:
            # Check if new Discord ID is already taken by another user
            other_user = get_user_by_discord_id(user_request.discord_id)
            if other_user and other_user['user_id'] != user_id:
                raise HTTPException(status_code=400, detail="Discord ID already exists")
            update_data['discord_id'] = user_request.discord_id
        
        if user_request.role is not None:
            update_data['role'] = user_request.role
        
        if user_request.bookmarks_video is not None:
            update_data['bookmarks_video'] = json.dumps(user_request.bookmarks_video)
        
        if user_request.bookmarks_voice is not None:
            update_data['bookmarks_voice'] = json.dumps(user_request.bookmarks_voice)
        
        if not update_data:
            raise HTTPException(status_code=400, detail="No valid fields to update")
        
        # Update user
        success = update_user(user_id, **update_data)
        if not success:
            raise HTTPException(status_code=500, detail="Failed to update user")
        
        # Return updated user
        updated_user = get_user_by_user_id(user_id)
        if not updated_user:
            raise HTTPException(status_code=500, detail="Failed to retrieve updated user")
        
        return UserResponse(**updated_user)
    except HTTPException:
        raise
    except Exception as e:
        log.error(f"Failed to update user: {e}")
        raise HTTPException(status_code=500, detail="Failed to update user")


@router.delete("/api/users/{user_id}")
async def delete_user_endpoint(user_id: str):
    """Delete user by ID."""
    try:
        # Check if user exists
        existing_user = get_user_by_user_id(user_id)
        if not existing_user:
            raise HTTPException(status_code=404, detail="User not found")
        
        success = db_delete_user(user_id)
        if not success:
            raise HTTPException(status_code=500, detail="Failed to delete user")
        
        return {"message": "User deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        log.error(f"Failed to delete user: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete user")


@router.get("/api/users/me", response_model=UserResponse)
async def get_current_user():
    """Get current user profile (placeholder for future login system)."""
    # This is a placeholder for when we implement login
    # For now, return a default user or require authentication
    raise HTTPException(status_code=501, detail="Login system not implemented yet")
