"""Bot management package for SlopSoil.

This package provides bot lifecycle management, voice operations, and state queries.
For backwards compatibility, all exports from bot_runner are re-exported here.
"""

# Re-export everything from bot_runner for backwards compatibility
from backend.bot_runner import (
    # Lifecycle
    start_bot,
    stop_bot,
    reload_bot,
    _load_config_from_db,
    _set_env_from_config,
    mark_config_modified,
    clear_config_modified,
    is_config_modified,
    _ORIGINAL_ENV_VARS,
    # State queries
    get_bot_instance,
    get_source_manager,
    get_bot_status,
    get_pending_reload_status,
    get_now_playing,
    # Voice operations
    get_bot_guilds,
    get_guild_voice_channels,
    get_bot_voice_status,
    join_voice_channel,
    leave_voice_channel,
    execute_bot_command,
)

__all__ = [
    # Lifecycle
    "start_bot",
    "stop_bot", 
    "reload_bot",
    "_load_config_from_db",
    "_set_env_from_config",
    "mark_config_modified",
    "clear_config_modified",
    "is_config_modified",
    "_ORIGINAL_ENV_VARS",
    # State
    "get_bot_instance",
    "get_source_manager",
    "get_bot_status",
    "get_pending_reload_status",
    "get_now_playing",
    # Voice
    "get_bot_guilds",
    "get_guild_voice_channels",
    "get_bot_voice_status",
    "join_voice_channel",
    "leave_voice_channel",
    "execute_bot_command",
]
