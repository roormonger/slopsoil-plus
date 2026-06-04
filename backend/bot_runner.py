"""Bot lifecycle management for SlopSoil Web GUI."""

from __future__ import annotations

import asyncio
import logging
import os
import sys
from pathlib import Path
from typing import Any

import discord

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from backend.database import (
    clear_config_modified,
    get_all_settings,
    get_all_users,
    is_config_modified,
    set_setting,
)
from backend.ws import ws_manager

# Import the bot class from slopsoil package
from bot import SlopSoil

log = logging.getLogger(__name__)

# Global bot instance reference
_bot_instance: SlopSoil | None = None
_bot_task: asyncio.Task | None = None
_bot_should_stop: bool = False
_bot_start_time: float | None = None


def _get_uptime_seconds() -> int:
    """Get bot uptime in seconds."""
    if _bot_start_time is None:
        return 0
    import time
    return int(time.time() - _bot_start_time)


def _load_config_from_db() -> dict[str, Any]:
    """Load configuration from database."""
    settings = get_all_settings()
    users = get_all_users()

    # Convert allowed users to set of ints
    allowed_ids = set()
    for user in users:
        discord_id = user.get("discord_id", "").strip()
        if discord_id.isdigit():
            allowed_ids.add(int(discord_id))

    return {
        "token": settings.get("discord_token", ""),
        "avatar_url": settings.get("discord_avatar_url", ""),
        "command_prefix": settings.get("command_prefix", "!"),
        "allowed_ids": allowed_ids,
        "timezone": settings.get("timezone", ""),
        "tvheadend": {
            "url": settings.get("tvheadend_url", ""),
            "user": settings.get("tvheadend_user", ""),
            "pass": settings.get("tvheadend_pass", ""),
        },
        "jellyfin": {
            "url": settings.get("jellyfin_url", ""),
            "api_key": settings.get("jellyfin_api_key", ""),
        },
    }


def _set_env_from_config(config: dict[str, Any]) -> None:
    """Set environment variables from config for legacy cog compatibility."""
    # TVheadend
    if config["tvheadend"]["url"]:
        os.environ["TVHEADEND_URL"] = config["tvheadend"]["url"]
    if config["tvheadend"]["user"]:
        os.environ["TVHEADEND_USER"] = config["tvheadend"]["user"]
    if config["tvheadend"]["pass"]:
        os.environ["TVHEADEND_PASS"] = config["tvheadend"]["pass"]

    # Jellyfin
    if config["jellyfin"]["url"]:
        os.environ["JELLYFIN_URL"] = config["jellyfin"]["url"]
    if config["jellyfin"]["api_key"]:
        os.environ["JELLYFIN_API_KEY"] = config["jellyfin"]["api_key"]

    # Timezone
    if config["timezone"]:
        os.environ["TIMEZONE"] = config["timezone"]

    # ALLOWED_USER_IDS as comma-separated
    if config["allowed_ids"]:
        os.environ["ALLOWED_USER_IDS"] = ",".join(str(uid) for uid in config["allowed_ids"])


async def start_bot() -> bool:
    """Start the Discord bot with current DB configuration.

    Returns True if started successfully, False otherwise.
    """
    global _bot_instance, _bot_task, _bot_should_stop

    if _bot_instance is not None:
        log.warning("Bot is already running")
        return False

    config = _load_config_from_db()

    if not config["token"]:
        log.error("Discord token not configured in database")
        return False

    # Set env vars for legacy cog compatibility
    _set_env_from_config(config)

    # Start bot supervisor in background task
    _bot_task = asyncio.create_task(_bot_supervisor(config))
    log.info("Discord bot started")

    # Start WebSocket broadcast watcher
    asyncio.create_task(_ws_state_watcher())
    return True


async def _bot_supervisor(config: dict) -> None:
    """Supervisor that starts the bot and retries on failure."""
    global _bot_instance, _bot_should_stop
    token = config["token"]
    stored_avatar_url = config.get("avatar_url", "")
    max_retries = 10
    retries = 0
    while retries < max_retries:
        if _bot_should_stop:
            break
        try:
            _bot_instance = SlopSoil(
                config["allowed_ids"], command_prefix=config["command_prefix"]
            )
            await _run_bot(token, stored_avatar_url)
            return  # Normal exit
        except asyncio.CancelledError:
            _bot_instance = None
            _bot_should_stop = False
            raise
        except Exception as e:
            retries += 1
            _bot_instance = None
            if _bot_should_stop:
                break
            log.error("Bot crashed (attempt %d/%d): %s", retries, max_retries, e)
            if retries < max_retries:
                wait = min(2 ** retries, 60)
                log.info("Retrying bot start in %ds...", wait)
                await asyncio.sleep(wait)
    _bot_should_stop = False


async def _run_bot(token: str, stored_avatar_url: str = "") -> None:
    """Internal coroutine to run the bot. Assumes _bot_instance is set."""
    global _bot_instance
    if _bot_instance:
        await _bot_instance.start(token)
        # Wait for bot to be ready before checking avatar
        await _bot_instance.wait_until_ready()
        # Mark start time for uptime tracking
        global _bot_start_time
        _bot_start_time = __import__("time").time()
        # Bot is ready - fetch avatar from user object
        if _bot_instance.user:
            has_avatar = _bot_instance.user.avatar is not None
            avatar_url = str(_bot_instance.user.avatar.url) if has_avatar else ""
            log.info(
                "DEBUG: Bot user found. has_avatar=%s, avatar_url=%r, stored=%r",
                has_avatar,
                avatar_url,
                stored_avatar_url,
            )
            if avatar_url != stored_avatar_url:
                set_setting("discord_avatar_url", avatar_url)
                log.info("Updated Discord bot avatar URL")
            else:
                log.info("DEBUG: Avatar URL unchanged, no update needed")
        else:
            log.warning("DEBUG: Bot user is None after start")


async def stop_bot() -> bool:
    """Stop the Discord bot cleanly.

    Returns True if stopped successfully.
    """
    global _bot_instance, _bot_task, _bot_should_stop, _bot_start_time

    if _bot_instance is None:
        return True

    _bot_should_stop = True
    log.info("Stopping Discord bot...")

    try:
        await _bot_instance.close()
    except Exception as e:
        log.error("Error stopping bot: %s", e)

    if _bot_task and not _bot_task.done():
        _bot_task.cancel()
        try:
            await _bot_task
        except asyncio.CancelledError:
            pass

    _bot_instance = None
    _bot_task = None
    _bot_start_time = None
    log.info("Discord bot stopped")
    return True


async def reload_bot() -> bool:
    """Hot-reload the Discord bot with fresh configuration.

    Returns True if reloaded successfully, False otherwise.
    """
    log.info("Reloading bot...")

    # Stop existing bot
    await stop_bot()

    # Small delay to ensure cleanup
    await asyncio.sleep(1)

    # Start with new config
    success = await start_bot()

    if success:
        log.info("Bot reloaded successfully")
    else:
        log.error("Bot reload failed")

    return success


def is_bot_running() -> bool:
    """Check if bot is currently running."""
    return _bot_instance is not None and _bot_task is not None and not _bot_task.done()


def get_bot_instance() -> SlopSoil | None:
    """Get the current bot instance if running.

    Returns None if bot is not running.
    """
    return _bot_instance


def get_bot_status() -> dict[str, Any]:
    """Get current bot status."""
    running = is_bot_running()
    config = _load_config_from_db()

    if running:
        status = "online"
    elif config["token"]:
        status = "offline"
    else:
        status = "awaiting_token"

    streaming_count = 0
    guild_count = 0
    bot_info = None
    if _bot_instance is not None:
        streaming_count = len(_bot_instance.now_playing)
        guild_count = len(_bot_instance.guilds)
        # Get bot user info
        user = _bot_instance.user
        if user:
            bot_info = {
                "id": str(user.id),
                "name": user.name,
                "avatar_url": str(user.avatar.url) if user.avatar else config.get("avatar_url"),
            }
    elif config.get("avatar_url"):
        # Use stored avatar URL when bot is offline
        bot_info = {
            "avatar_url": config["avatar_url"],
        }

    uptime = _get_uptime_seconds() if running else 0
    latency = round(_bot_instance.latency * 1000, 1) if _bot_instance and hasattr(_bot_instance, 'latency') else 0
    return {
        "status": status,
        "running": running,
        "has_token": bool(config["token"]),
        "user_count": len(config["allowed_ids"]),
        "streaming_count": streaming_count,
        "guild_count": guild_count,
        "uptime": uptime,
        "latency": latency,
        "bot": bot_info,
    }


def get_now_playing() -> dict[str, Any]:
    """Get currently playing streams."""
    if _bot_instance is None:
        return {"streams": [], "count": 0}

    # Handle case where now_playing doesn't exist or is None
    now_playing = getattr(_bot_instance, 'now_playing', None) or {}

    streams = []
    for guild_id, info in now_playing.items():
        streams.append({
            "guild_id": guild_id,
            "guild_name": info.get("guild_name", "Unknown"),
            "title": info.get("title", "Unknown"),
            "url": info.get("url", ""),
            "started_at": info.get("started_at", ""),
        })

    return {"streams": streams, "count": len(streams)}


def get_pending_reload_status() -> dict[str, Any]:
    """Get pending reload status for config changes."""
    needs_reload, timestamp = is_config_modified()
    return {
        "needs_reload": needs_reload,
        "last_modified": timestamp,
    }


async def fetch_discord_user(user_id: str) -> dict[str, Any]:
    """Fetch Discord user information by ID.

    Returns user info if found, error if not found or bot not running.
    """
    if _bot_instance is None:
        return {"found": False, "error": "Bot is not running"}

    try:
        user = await _bot_instance.fetch_user(int(user_id))
        avatar_url = user.display_avatar.url if user.display_avatar else None
        return {
            "found": True,
            "id": str(user.id),
            "username": user.name,
            "avatar_url": avatar_url,
        }
    except discord.NotFound:
        return {"found": False, "error": "User not found"}
    except discord.HTTPException as e:
        return {"found": False, "error": f"Discord API error: {e.text}"}
    except Exception as e:
        return {"found": False, "error": str(e)}


def get_source_manager() -> Any | None:
    """Get the bot's SourceManager for IPTV sources.

    Returns None if bot is not running.
    """
    if _bot_instance is None:
        return None
    return getattr(_bot_instance, "source_manager", None)


def get_bot_guilds() -> list[dict[str, Any]]:
    """Get list of guilds the bot is connected to.

    Returns empty list if bot is not running.
    """
    if _bot_instance is None:
        return []

    guilds = []
    for guild in _bot_instance.guilds:
        icon_url = str(guild.icon.url) if guild.icon else None
        guilds.append({
            "id": str(guild.id),
            "name": guild.name,
            "icon_url": icon_url,
        })
    return guilds


def get_guild_voice_channels(guild_id: str) -> list[dict[str, Any]] | None:
    """Get voice channels for a specific guild.

    Returns None if guild not found, empty list if no voice channels.
    """
    if _bot_instance is None:
        return None

    guild = _bot_instance.get_guild(int(guild_id))
    if guild is None:
        return None

    voice_channels = []
    for channel in guild.voice_channels:
        voice_channels.append({
            "id": str(channel.id),
            "name": channel.name,
        })
    return voice_channels


def get_bot_voice_status() -> dict[str, Any]:
    """Get current voice connection status.

    Returns info about which guild and channel the bot is connected to.
    """
    if _bot_instance is None:
        return {"connected": False}

    for guild in _bot_instance.guilds:
        vc = guild.voice_client
        if vc and vc.channel:
            return {
                "connected": True,
                "guild_id": str(guild.id),
                "guild_name": guild.name,
                "channel_id": str(vc.channel.id),
                "channel_name": vc.channel.name,
            }
    return {"connected": False}


def get_music_status() -> dict[str, Any] | None:
    """Get current music playback status.

    Returns None if bot is not running.
    """
    if _bot_instance is None:
        return None

    music_current = getattr(_bot_instance, "music_current", {})
    music_queues = getattr(_bot_instance, "music_queues", {})
    music_volumes = getattr(_bot_instance, "music_volumes", {})

    guild_id = next(iter(music_current.keys()), None)

    current_track = None
    queue_tracks = []
    is_playing = False
    is_paused = False
    volume = 1.0

    if guild_id is not None:
        current = music_current.get(guild_id)
        queue = music_queues.get(guild_id, [])
        volume = music_volumes.get(guild_id, 1.0)

        guild = _bot_instance.get_guild(guild_id)
        if guild and guild.voice_client:
            is_playing = guild.voice_client.is_playing()
            is_paused = guild.voice_client.is_paused()

        if current:
            current_track = {
                "url": current.url,
                "title": current.title,
                "duration": current.duration,
                "thumbnail": current.thumbnail,
                "requested_by": current.requested_by,
                "webpage_url": current.webpage_url,
            }

        queue_tracks = [
            {
                "url": track.url,
                "title": track.title,
                "duration": track.duration,
                "thumbnail": track.thumbnail,
                "requested_by": track.requested_by,
                "webpage_url": track.webpage_url,
            }
            for track in queue
        ]

    return {
        "current": current_track,
        "queue": queue_tracks,
        "queue_length": len(queue_tracks),
        "volume": volume,
        "is_playing": is_playing,
        "is_paused": is_paused,
    }


async def join_voice_channel(guild_id: str, channel_id: str) -> dict[str, Any]:
    """Join a specific voice channel in a guild.

    Returns success status and message.
    """
    if _bot_instance is None:
        return {"success": False, "message": "Bot is not running"}

    guild = _bot_instance.get_guild(int(guild_id))
    if guild is None:
        return {"success": False, "message": "Guild not found"}

    channel = guild.get_channel(int(channel_id))
    if channel is None:
        return {"success": False, "message": "Voice channel not found"}

    if not isinstance(channel, discord.VoiceChannel):
        return {"success": False, "message": "Channel is not a voice channel"}

    try:
        # Check if already connected to this channel
        vc = guild.voice_client
        if vc and vc.channel and vc.channel.id == channel.id:
            return {"success": True, "message": f"Already in {channel.name}"}

        # Move or connect
        if vc:
            await vc.move_to(channel)
            await _broadcast_voice_state(guild_id, True, channel_id)
            return {"success": True, "message": f"Moved to {channel.name}"}
        else:
            await channel.connect(self_deaf=True)
            await _broadcast_voice_state(guild_id, True, channel_id)
            return {"success": True, "message": f"Joined {channel.name}"}

    except Exception as e:
        log.error("Failed to join voice channel: %s", e)
        return {"success": False, "message": f"Error: {str(e)}"}


async def leave_voice_channel(guild_id: str) -> dict[str, Any]:
    """Leave voice channel in a guild.

    Returns success status and message.
    """
    if _bot_instance is None:
        return {"success": False, "message": "Bot is not running"}

    guild = _bot_instance.get_guild(int(guild_id))
    if guild is None:
        return {"success": False, "message": "Guild not found"}

    vc = guild.voice_client
    if not vc:
        return {"success": False, "message": "Not in a voice channel"}

    try:
        # Import cancel_stream to stop any ongoing streams
        from cogs.stream import cancel_stream
        cancel_stream(_bot_instance, guild.id)
        await vc.disconnect(force=False)
        return {"success": True, "message": "Left voice channel"}
    except Exception as e:
        log.error("Failed to leave voice channel: %s", e)
        return {"success": False, "message": f"Error: {str(e)}"}


async def execute_bot_command(
    guild_id: str,
    command: str,
    args: str = "",
    source_user: dict[str, str] | None = None,
) -> dict[str, Any]:
    """Execute a bot command programmatically.

    Args:
        guild_id: The guild to execute the command in
        command: The command name (e.g., 'play', 'stop', 'channels')
        args: Command arguments

    Returns:
        Dict with success status and message/result
    """
    if _bot_instance is None:
        return {"success": False, "message": "Bot is not running"}

    guild = _bot_instance.get_guild(int(guild_id))
    if guild is None:
        return {"success": False, "message": "Guild not found"}

    # Get the command
    cmd = _bot_instance.get_command(command)
    if cmd is None:
        return {"success": False, "message": f"Command '!{command}' not found"}

    # Create a mock context for command execution
    # We'll capture the output by overriding the send method
    messages = []

    class MockContext:
        def __init__(self, bot, guild, messages_list):
            self.bot = bot
            self.guild = guild
            self.author = guild.me  # Bot as the author
            self.channel = None
            self.voice_client = guild.voice_client
            self._messages = messages_list

        async def send(self, content=None, **kwargs):
            if content:
                self._messages.append(str(content))
            return None

        async def invoke(self, command, *args, **kwargs):
            # Override to use our mock
            return await command.callback(self.cog, self, *args, **kwargs)

    try:
        ctx = MockContext(_bot_instance, guild, messages)

        # Set the cog on the context for command access
        if cmd.cog:
            ctx.cog = cmd.cog

        # Import inspect to check command signature
        import inspect

        # Get the command callback signature
        callback = cmd.callback
        sig = inspect.signature(callback)
        params = list(sig.parameters.values())

        # Filter out 'self' and 'ctx' parameters
        cmd_params = [p for p in params if p.name not in ('self', 'ctx')]

        # Parse arguments
        if args.strip():
            # Check if the command has keyword-only arguments (like *, query: str)
            kwonly_params = [p for p in cmd_params if p.kind == inspect.Parameter.KEYWORD_ONLY]

            if kwonly_params:
                # For commands with keyword-only args (like !media), pass as keyword argument
                # The entire args string becomes the value of the keyword-only parameter
                param_name = kwonly_params[0].name
                await callback(ctx.cog, ctx, **{param_name: args.strip()})
            elif cmd_params:
                # For commands with regular positional args, split and pass individually
                arg_parts = args.strip().split()
                await callback(ctx.cog, ctx, *arg_parts)
            else:
                # No additional parameters expected
                await callback(ctx.cog, ctx)
        else:
            await callback(ctx.cog, ctx)

        # Determine cog/category for logging
        cog_name = callback.__self__.__class__.__name__ if hasattr(callback, "__self__") else None
        is_voice = cog_name in ("Voice",)
        is_video = cog_name in ("TV", "IPTV", "Jellyfin", "VideoPlayer")
        is_music = cog_name in ("Music",)

        # Log web command if source user provided
        if source_user:
            try:
                from backend.database import log_command as db_log_command
                db_log_command(
                    source="web",
                    command=command,
                    args=args.split() if args else None,
                    user_id=source_user.get("user_id"),
                    username=source_user.get("username"),
                    guild_id=guild_id,
                    guild_name=source_user.get("guild_name"),
                    channel_id=source_user.get("channel_id"),
                    channel_name=source_user.get("channel_name"),
                    cog_name=cog_name,
                    is_voice=is_voice,
                    is_video=is_video,
                    is_music=is_music,
                    success=True,
                )
            except Exception:
                pass

        # Return captured messages or success
        if messages:
            return {
                "success": True,
                "message": " | ".join(messages),
                "command": command,
                "cog_name": cog_name,
                "is_voice": is_voice,
                "is_video": is_video,
                "is_music": is_music,
            }
        return {
            "success": True,
            "message": "Command executed",
            "command": command,
            "cog_name": cog_name,
            "is_voice": is_voice,
            "is_video": is_video,
            "is_music": is_music,
        }

    except Exception as e:
        log.error("Command execution failed: %s", e)
        if source_user:
            try:
                from backend.database import log_command as db_log_command
                db_log_command(
                    source="web",
                    command=command,
                    args=args.split() if args else None,
                    user_id=source_user.get("user_id"),
                    username=source_user.get("username"),
                    guild_id=guild_id,
                    guild_name=source_user.get("guild_name"),
                    channel_id=source_user.get("channel_id"),
                    channel_name=source_user.get("channel_name"),
                    success=False,
                    error_message=str(e),
                )
            except Exception:
                pass
        return {"success": False, "message": f"Error: {str(e)}"}


# WebSocket broadcast helpers

_last_now_playing: dict | None = None
_last_bot_status: dict | None = None
_last_music_status: dict | None = None
_last_voice_status: dict | None = None


async def _ws_state_watcher() -> None:
    """Background task that watches bot state and broadcasts changes."""
    global _last_now_playing, _last_bot_status, _last_music_status, _last_voice_status
    while True:
        await asyncio.sleep(3)
        if _bot_instance is None:
            # Bot offline — broadcast same format as get_bot_status()
            try:
                offline_status = get_bot_status()
            except Exception:
                continue
            if _last_bot_status != offline_status:
                _last_bot_status = offline_status
                await ws_manager.broadcast("bot:status", offline_status)
            continue

        # Bot online — check status
        try:
            current_status = get_bot_status()
        except Exception:
            continue
        if _last_bot_status != current_status:
            _last_bot_status = current_status
            await ws_manager.broadcast("bot:status", current_status)

        # Check now playing
        try:
            current_np = get_now_playing()
        except Exception:
            current_np = {"streams": [], "count": 0}
        if _last_now_playing != current_np:
            _last_now_playing = current_np
            await ws_manager.broadcast("player:now-playing", current_np)

        # Check music status
        try:
            current_music = get_music_status()
        except Exception:
            current_music = None
        if _last_music_status != current_music:
            _last_music_status = current_music
            await ws_manager.broadcast("music:status", current_music)

        # Check voice status
        try:
            current_voice = get_bot_voice_status()
        except Exception:
            current_voice = {"connected": False}
        if _last_voice_status != current_voice:
            _last_voice_status = current_voice
            await ws_manager.broadcast("voice:state", current_voice)


async def _broadcast_voice_state(guild_id: str, connected: bool, channel_id: str | None = None) -> None:
    """Broadcast voice state change via WebSocket."""
    await ws_manager.broadcast(
        "voice:state",
        {"guild_id": guild_id, "connected": connected, "channel_id": channel_id},
    )
