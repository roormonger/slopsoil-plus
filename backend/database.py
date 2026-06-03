"""SQLite database for SlopSoil configuration management."""

from __future__ import annotations

import os
import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Any

import bcrypt
from pydantic import BaseModel

# Import encryption utilities
from backend.encryption import encrypt_value, decrypt_value, is_encrypted

# Capture which environment variables were originally set at startup
# (before bot_runner or other code modifies os.environ)
_ORIGINAL_ENV_VARS: set[str] = set()
for _key, _value in os.environ.items():
    # Only track env vars that correspond to our settings (uppercase versions)
    _ORIGINAL_ENV_VARS.add(_key.upper())

# Ensure data directory exists
DATA_DIR = Path("./data")
DATA_DIR.mkdir(exist_ok=True)
DB_PATH = DATA_DIR / "slopsoil.db"

# Fields that should be encrypted at rest
ENCRYPTED_SETTINGS_KEYS = {
    "discord_token",
    "tvheadend_pass",
    "jellyfin_api_key",
}

ENCRYPTED_USER_FIELDS = {
    "discord_id",
}

# Pydantic models for API responses
class UserResponse(BaseModel):
    """User response model for API."""
    user_id: str
    username: str
    role: str
    avatar: str | None = None
    discord_id: str | None = None
    created_at: str


# Default settings keys to pre-seed
def hash_password(password: str) -> str:
    """Hash a password using bcrypt."""
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')


def verify_password(password: str, password_hash: str) -> bool:
    """Verify a password against a hash."""
    return bcrypt.checkpw(password.encode('utf-8'), password_hash.encode('utf-8'))


def authenticate_user(username: str, password: str) -> dict[str, Any] | None:
    """Authenticate a user with username and password.
    
    Returns user dict if valid, None otherwise.
    """
    user = get_user_by_username(username)
    if not user:
        return None
    
    if verify_password(password, user['password_hash']):
        # Remove password_hash from response for security
        return {k: v for k, v in user.items() if k != 'password_hash'}
    return None


DEFAULT_SETTINGS = {
    "discord_token": "",
    "discord_avatar_url": "",  # Bot user avatar URL
    "command_prefix": "!",
    "tvheadend_url": "",
    "tvheadend_user": "",
    "tvheadend_pass": "",
    "jellyfin_url": "",
    "jellyfin_api_key": "",
    "timezone": "",
    "ytdlp_format": "bestvideo+bestaudio/best",
    "stream_quality": "1080p",
    "stream_resolution": "1920:1080",
    "stream_fps": "60",
    "stream_video_bitrate": "6000k",
    "stream_packet_pace": "0",
    "stream_av_sync_ms": "0",
    "_config_modified_at": "",  # Internal timestamp for reload notifications
}


def _dict_factory(cursor: sqlite3.Cursor, row: tuple[Any, ...]) -> dict[str, Any]:
    """Convert row to dictionary."""
    d: dict[str, Any] = {}
    for idx, col in enumerate(cursor.description):
        d[col[0]] = row[idx]
    return d


@contextmanager
def get_connection():
    """Get a database connection with row factory set to dict."""
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = _dict_factory
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_database() -> None:
    """Initialize database with schema and default settings."""
    with get_connection() as conn:
        cursor = conn.cursor()

        # Settings table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL DEFAULT ''
            )
        """)

        # Allowed users table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS allowed_users (
                discord_id TEXT PRIMARY KEY,
                username TEXT,
                avatar_url TEXT
            )
        """)

        # Migration: add avatar_url column if it doesn't exist
        try:
            cursor.execute("SELECT avatar_url FROM allowed_users LIMIT 1")
        except sqlite3.OperationalError:
            cursor.execute("ALTER TABLE allowed_users ADD COLUMN avatar_url TEXT")

        # New users table for comprehensive user management
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT UNIQUE NOT NULL,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                avatar TEXT,
                discord_id TEXT UNIQUE,
                role TEXT NOT NULL DEFAULT 'user',
                bookmarks_video TEXT DEFAULT '[]',
                bookmarks_voice TEXT DEFAULT '[]',
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # Migration: add updated_at column if it doesn't exist
        try:
            cursor.execute("SELECT updated_at FROM users LIMIT 1")
        except sqlite3.OperationalError:
            cursor.execute("ALTER TABLE users ADD COLUMN updated_at TEXT DEFAULT CURRENT_TIMESTAMP")

        # Bookmarks table for direct stream/URL bookmarks
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS bookmarks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT UNIQUE NOT NULL,
                url TEXT NOT NULL,
                enabled INTEGER DEFAULT 1,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # Command history table for analytics
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS command_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                source TEXT NOT NULL DEFAULT 'discord',
                command TEXT NOT NULL,
                args TEXT,
                user_id TEXT,
                username TEXT,
                guild_id TEXT,
                guild_name TEXT,
                channel_id TEXT,
                channel_name TEXT,
                cog_name TEXT,
                is_voice INTEGER NOT NULL DEFAULT 0,
                is_video INTEGER NOT NULL DEFAULT 0,
                is_music INTEGER NOT NULL DEFAULT 0,
                success INTEGER NOT NULL DEFAULT 1,
                error_message TEXT
            )
        """)

        # Pre-seed default settings if they don't exist
        for key, value in DEFAULT_SETTINGS.items():
            cursor.execute(
                "INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)",
                (key, value),
            )


def get_setting(key: str) -> str:
    """Get a setting value by key. Automatically decrypts sensitive fields."""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT value FROM settings WHERE key = ?", (key,))
        row = cursor.fetchone()
        value = row["value"] if row else ""
        
        # Decrypt if this is a sensitive field and appears encrypted
        if key in ENCRYPTED_SETTINGS_KEYS and value and is_encrypted(value):
            try:
                return decrypt_value(value) or ""
            except Exception:
                # If decryption fails, return raw value (might be unencrypted legacy data)
                return value
        
        return value


def get_setting_with_env_fallback(key: str) -> tuple[str, bool]:
    """Get a setting value, checking env var first (takes precedence over DB).
    
    Returns tuple of (value: str, from_env: bool)
    """
    # Check environment variable first (uppercase version of key)
    # Only consider env vars that were originally set at startup, not ones
    # set at runtime by bot_runner for legacy compatibility
    env_key = key.upper()
    from_env = env_key in _ORIGINAL_ENV_VARS
    env_value = os.environ.get(env_key) if from_env else None
    
    if from_env and env_value is not None:
        # Env var exists and was originally set - use it (env vars are never encrypted)
        return (env_value, True)
    
    # Fall back to database value
    db_value = get_setting(key)
    return (db_value, False)


def set_setting(key: str, value: str) -> None:
    """Set a setting value. Automatically encrypts sensitive fields."""
    # Encrypt if this is a sensitive field and value is not empty
    if key in ENCRYPTED_SETTINGS_KEYS and value and not is_encrypted(value):
        try:
            value = encrypt_value(value) or value
        except Exception:
            # If encryption fails, store as-is (better than losing data)
            pass
    
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?",
            (key, value, value),
        )


def mark_config_modified() -> None:
    """Mark configuration as modified - used to trigger reload notification."""
    from datetime import datetime, timezone
    timestamp = datetime.now(timezone.utc).isoformat()
    set_setting("_config_modified_at", timestamp)


def clear_config_modified() -> None:
    """Clear the config modified flag after successful reload."""
    set_setting("_config_modified_at", "")


def get_all_settings() -> dict[str, str]:
    """Get all settings as a dictionary. Automatically decrypts sensitive fields."""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT key, value FROM settings")
        rows = cursor.fetchall()
        
        settings = {}
        for row in rows:
            key = row["key"]
            value = row["value"]
            
            # Decrypt if this is a sensitive field and appears encrypted
            if key in ENCRYPTED_SETTINGS_KEYS and value and is_encrypted(value):
                try:
                    value = decrypt_value(value) or ""
                except Exception:
                    # If decryption fails, use raw value
                    pass
            
            settings[key] = value
        
        return settings


def get_all_settings_with_env() -> dict[str, dict[str, Any]]:
    """Get all settings as a dictionary with env var source info.
    
    Returns dict where each value is {value: str, from_env: bool}
    """
    # Get all settings from DB
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT key, value FROM settings")
        rows = cursor.fetchall()
        
        db_settings = {}
        for row in rows:
            key = row["key"]
            value = row["value"]
            
            # Decrypt if this is a sensitive field and appears encrypted
            if key in ENCRYPTED_SETTINGS_KEYS and value and is_encrypted(value):
                try:
                    value = decrypt_value(value) or ""
                except Exception:
                    pass
            
            db_settings[key] = value
    
    # Apply env var overrides (only from originally set env vars, not runtime modifications)
    result: dict[str, dict[str, Any]] = {}
    for key, db_value in db_settings.items():
        env_key = key.upper()
        # Check if this env var was originally set at startup (before bot_runner modified os.environ)
        from_env = env_key in _ORIGINAL_ENV_VARS
        env_value = os.environ.get(env_key) if from_env else None
        
        if from_env and env_value is not None:
            # Env var takes precedence
            result[key] = {"value": env_value, "from_env": True}
        else:
            result[key] = {"value": db_value, "from_env": False}
    
    return result


def is_config_modified() -> tuple[bool, str]:
    """Check if config has been modified since last reload.
    
    Returns: (needs_reload, timestamp)
    """
    timestamp = get_setting("_config_modified_at")
    return (bool(timestamp), timestamp)








# Bookmark management functions

def add_bookmark(name: str, url: str) -> None:
    """Add a new bookmark."""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO bookmarks (name, url, enabled) VALUES (?, ?, 1)",
            (name, url),
        )


def get_bookmarks() -> list[dict[str, Any]]:
    """Get all bookmarks."""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id, name, url, enabled FROM bookmarks ORDER BY name")
        rows = cursor.fetchall()
        return [
            {
                "id": row["id"],
                "name": row["name"],
                "url": row["url"],
                "enabled": bool(row["enabled"]),
            }
            for row in rows
        ]


def get_enabled_bookmarks() -> list[dict[str, Any]]:
    """Get only enabled bookmarks."""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id, name, url FROM bookmarks WHERE enabled = 1 ORDER BY name")
        rows = cursor.fetchall()
        return [dict(row) for row in rows]


def set_bookmark_enabled(bookmark_id: int, enabled: bool) -> None:
    """Enable or disable a bookmark."""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "UPDATE bookmarks SET enabled = ? WHERE id = ?",
            (1 if enabled else 0, bookmark_id),
        )


def delete_bookmark(bookmark_id: int) -> bool:
    """Delete a bookmark. Returns True if deleted."""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM bookmarks WHERE id = ?", (bookmark_id,))
        return cursor.rowcount > 0


# User management functions

import uuid
import json
from datetime import datetime, timezone


def generate_user_id() -> str:
    """Generate a unique user ID."""
    return str(uuid.uuid4())


def create_user(username: str, password_hash: str, role: str = "user",
                avatar: str | None = None, discord_id: str | None = None) -> str:
    """Create a new user and return the generated user_id."""
    user_id = generate_user_id()
    created_at = datetime.now(timezone.utc).isoformat()

    # Encrypt sensitive fields
    encrypted_discord_id = encrypt_value(discord_id) if discord_id else None

    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO users (user_id, username, password_hash, role, avatar, discord_id, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (user_id, username, password_hash, role, avatar, encrypted_discord_id, created_at, created_at))

    return user_id


def _parse_user_fields(user: dict[str, Any] | None) -> dict[str, Any] | None:
    """Parse and decrypt user fields after retrieval from database."""
    if user is None:
        return None

    # Parse bookmarks_video
    try:
        user['bookmarks_video'] = json.loads(user.get('bookmarks_video', '[]'))
    except (json.JSONDecodeError, TypeError):
        user['bookmarks_video'] = []

    # Parse bookmarks_voice
    try:
        user['bookmarks_voice'] = json.loads(user.get('bookmarks_voice', '[]'))
    except (json.JSONDecodeError, TypeError):
        user['bookmarks_voice'] = []

    # Decrypt sensitive fields
    discord_id = user.get('discord_id')
    if discord_id and is_encrypted(discord_id):
        try:
            user['discord_id'] = decrypt_value(discord_id)
        except Exception:
            # If decryption fails, keep original value
            pass

    return user


def get_user_by_username(username: str) -> dict[str, Any] | None:
    """Get user by username."""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM users WHERE username = ?", (username,))
        row = cursor.fetchone()
        return _parse_user_fields(dict(row) if row else None)


def get_user_by_user_id(user_id: str) -> dict[str, Any] | None:
    """Get user by user_id."""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM users WHERE user_id = ?", (user_id,))
        row = cursor.fetchone()
        return _parse_user_fields(dict(row) if row else None)


def _get_user_by_encrypted_discord_id(encrypted_discord_id: str) -> dict[str, Any] | None:
    """Internal: Get user by encrypted Discord ID."""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM users WHERE discord_id = ?", (encrypted_discord_id,))
        row = cursor.fetchone()
        return _parse_user_fields(dict(row) if row else None)


def get_user_by_discord_id(discord_id: str) -> dict[str, Any] | None:
    """Get user by Discord ID (plaintext). Searches through encrypted values."""
    # Since we can't query by plaintext (it's encrypted), we need to scan
    # This is less efficient but necessary for encryption at rest
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM users WHERE discord_id IS NOT NULL")
        rows = cursor.fetchall()
        
        for row in rows:
            user = _parse_user_fields(dict(row))
            if user and user.get('discord_id') == discord_id:
                return user
        
        return None


def update_user(user_id: str, **kwargs) -> bool:
    """Update user fields. Returns True if user was updated."""
    if not kwargs:
        return False

    # Encrypt sensitive fields if present
    if 'discord_id' in kwargs and kwargs['discord_id'] and not is_encrypted(kwargs['discord_id']):
        kwargs['discord_id'] = encrypt_value(kwargs['discord_id'])

    # Add updated_at timestamp
    kwargs['updated_at'] = datetime.now(timezone.utc).isoformat()

    # Build dynamic update query
    set_clause = ", ".join([f"{key} = ?" for key in kwargs.keys()])
    values = list(kwargs.values()) + [user_id]

    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(f"UPDATE users SET {set_clause} WHERE user_id = ?", values)
        return cursor.rowcount > 0


def delete_user(user_id: str) -> bool:
    """Delete a user. Returns True if user was deleted."""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM users WHERE user_id = ?", (user_id,))
        return cursor.rowcount > 0


def get_all_users(role_filter: str | None = None) -> list[dict[str, Any]]:
    """Get all users, optionally filtered by role."""
    with get_connection() as conn:
        cursor = conn.cursor()
        if role_filter:
            cursor.execute("SELECT * FROM users WHERE role = ? ORDER BY username", (role_filter,))
        else:
            cursor.execute("SELECT * FROM users ORDER BY username")

        users = []
        for row in cursor.fetchall():
            user = _parse_user_fields(dict(row))
            if user:
                users.append(user)

        return users


def update_user_bookmarks(user_id: str, bookmarks_type: str, bookmarks: list) -> bool:
    """Update user bookmarks (video or voice)."""
    if bookmarks_type not in ['video', 'voice']:
        return False

    bookmarks_json = json.dumps(bookmarks)
    column_name = f'bookmarks_{bookmarks_type}'

    return update_user(user_id, **{column_name: bookmarks_json})


# Command history logging

def log_command(
    source: str,
    command: str,
    args: list | None = None,
    user_id: str | None = None,
    username: str | None = None,
    guild_id: str | None = None,
    guild_name: str | None = None,
    channel_id: str | None = None,
    channel_name: str | None = None,
    cog_name: str | None = None,
    is_voice: bool = False,
    is_video: bool = False,
    is_music: bool = False,
    success: bool = True,
    error_message: str | None = None,
) -> int:
    """Log a command invocation to the history table.

    Returns the inserted row id.
    """
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO command_history (
                source, command, args, user_id, username,
                guild_id, guild_name, channel_id, channel_name,
                cog_name, is_voice, is_video, is_music, success, error_message
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                source,
                command,
                json.dumps(args) if args else None,
                user_id,
                username,
                guild_id,
                guild_name,
                channel_id,
                channel_name,
                cog_name,
                int(is_voice),
                int(is_video),
                int(is_music),
                int(success),
                error_message,
            ),
        )
        row_id = cursor.lastrowid

        # Broadcast new command via WebSocket
        try:
            import asyncio
            from backend.ws import ws_manager
            asyncio.create_task(
                ws_manager.broadcast(
                    "commands:new",
                    {
                        "id": row_id,
                        "command": command,
                        "username": username,
                        "timestamp": __import__("datetime").datetime.now().isoformat(),
                        "source": source,
                    },
                )
            )
        except Exception:
            pass

        return row_id


def get_command_history(
    limit: int = 100,
    offset: int = 0,
    source: str | None = None,
    guild_id: str | None = None,
    user_id: str | None = None,
) -> list[dict]:
    """Get paginated command history, optionally filtered."""
    with get_db() as conn:
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        query = "SELECT * FROM command_history WHERE 1=1"
        params: list[Any] = []

        if source:
            query += " AND source = ?"
            params.append(source)
        if guild_id:
            query += " AND guild_id = ?"
            params.append(guild_id)
        if user_id:
            query += " AND user_id = ?"
            params.append(user_id)

        query += " ORDER BY timestamp DESC LIMIT ? OFFSET ?"
        params.extend([limit, offset])

        cursor.execute(query, params)
        rows = cursor.fetchall()
        return [dict(row) for row in rows]


def get_command_stats(days: int = 30) -> dict[str, Any]:
    """Get aggregated command statistics for the given time window."""
    with get_db() as conn:
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        since = f"-{days} days"

        # Total commands
        cursor.execute(
            "SELECT COUNT(*) as total FROM command_history WHERE timestamp >= datetime('now', ?)",
            (since,),
        )
        total = cursor.fetchone()["total"]

        # By command
        cursor.execute(
            """
            SELECT command, COUNT(*) as count FROM command_history
            WHERE timestamp >= datetime('now', ?)
            GROUP BY command ORDER BY count DESC LIMIT 20
            """,
            (since,),
        )
        by_command = [dict(r) for r in cursor.fetchall()]

        # By user
        cursor.execute(
            """
            SELECT user_id, username, COUNT(*) as count FROM command_history
            WHERE timestamp >= datetime('now', ?)
            GROUP BY user_id ORDER BY count DESC LIMIT 20
            """,
            (since,),
        )
        by_user = [dict(r) for r in cursor.fetchall()]

        # By guild
        cursor.execute(
            """
            SELECT guild_id, guild_name, COUNT(*) as count FROM command_history
            WHERE timestamp >= datetime('now', ?)
            GROUP BY guild_id ORDER BY count DESC LIMIT 20
            """,
            (since,),
        )
        by_guild = [dict(r) for r in cursor.fetchall()]

        # By source
        cursor.execute(
            """
            SELECT source, COUNT(*) as count FROM command_history
            WHERE timestamp >= datetime('now', ?)
            GROUP BY source
            """,
            (since,),
        )
        by_source = {r["source"]: r["count"] for r in cursor.fetchall()}

        # By category (voice, video, music)
        cursor.execute(
            """
            SELECT
                SUM(is_voice) as voice,
                SUM(is_video) as video,
                SUM(is_music) as music,
                COUNT(*) - SUM(is_voice) - SUM(is_video) - SUM(is_music) as other
            FROM command_history
            WHERE timestamp >= datetime('now', ?)
            """,
            (since,),
        )
        row = cursor.fetchone()
        by_category = {
            "voice": row["voice"] or 0,
            "video": row["video"] or 0,
            "music": row["music"] or 0,
            "other": row["other"] or 0,
        }

        return {
            "total": total,
            "by_command": by_command,
            "by_user": by_user,
            "by_guild": by_guild,
            "by_source": by_source,
            "by_category": by_category,
        }


# Initialize on module import
init_database()
