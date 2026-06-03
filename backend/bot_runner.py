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

# Import the bot class from slopsoil package
from bot import SlopSoil

log = logging.getLogger(__name__)

# Global bot instance reference
_bot_instance: SlopSoil | None = None
_bot_task: asyncio.Task | None = None


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
    global _bot_instance, _bot_task

    if _bot_instance is not None:
        log.warning("Bot is already running")
        return False

    config = _load_config_from_db()

    if not config["token"]:
        log.error("Discord token not configured in database")
        return False

    # Set env vars for legacy cog compatibility
    _set_env_from_config(config)

    # Create and configure bot
    _bot_instance = SlopSoil(config["allowed_ids"], command_prefix=config["command_prefix"])

    # Start bot in background task
    _bot_task = asyncio.create_task(_run_bot(config["token"], config.get("avatar_url", "")))
    log.info("Discord bot started")
    return True


async def _run_bot(token: str, stored_avatar_url: str = "") -> None:
    """Internal coroutine to run the bot."""
    global _bot_instance
    try:
        if _bot_instance:
            await _bot_instance.start(token)
            # Wait for bot to be ready before checking avatar
            await _bot_instance.wait_until_ready()
            # Bot is ready - fetch avatar from user object
            if _bot_instance.user:
                has_avatar = _bot_instance.user.avatar is not None
                avatar_url = str(_bot_instance.user.avatar.url) if has_avatar else ""
                log.info(f"DEBUG: Bot user found. has_avatar={has_avatar}, avatar_url={avatar_url!r}, stored={stored_avatar_url!r}")
                if avatar_url != stored_avatar_url:
                    set_setting("discord_avatar_url", avatar_url)
                    log.info("Updated Discord bot avatar URL")
                else:
                    log.info("DEBUG: Avatar URL unchanged, no update needed")
            else:
                log.warning("DEBUG: Bot user is None after start")
    except Exception as e:
        log.error("Bot crashed: %s", e)
        _bot_instance = None


async def stop_bot() -> bool:
    """Stop the Discord bot cleanly.

    Returns True if stopped successfully.
    """
    global _bot_instance, _bot_task

    if _bot_instance is None:
        return True

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

    return {
        "status": status,
        "running": running,
        "has_token": bool(config["token"]),
        "user_count": len(config["allowed_ids"]),
        "streaming_count": streaming_count,
        "guild_count": guild_count,
        "bot": bot_info,
    }


def get_now_playing() -> dict[str, Any]:
    """Get currently playing streams."""
    if _bot_instance is None:
        return {"streams": [], "count": 0}

    streams = []
    for guild_id, info in _bot_instance.now_playing.items():
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
            return {"success": True, "message": f"Moved to {channel.name}"}
        else:
            await channel.connect(self_deaf=True)
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


async def execute_bot_command(guild_id: str, command: str, args: str = "") -> dict[str, Any]:
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

        # Return captured messages or success
        if messages:
            return {"success": True, "message": " | ".join(messages)}
        return {"success": True, "message": "Command executed"}

    except Exception as e:
        log.error("Command execution failed: %s", e)
        return {"success": False, "message": f"Error: {str(e)}"}
