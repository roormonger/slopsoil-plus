"""SQLite database for SlopSoil configuration management."""

from __future__ import annotations

import os
import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Any

# Import encryption utilities
from backend.encryption import encrypt_value, decrypt_value, is_encrypted

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

# Default settings keys to pre-seed
DEFAULT_SETTINGS = {
    "discord_token": "",
    "command_prefix": "!",
    "tvheadend_url": "",
    "tvheadend_user": "",
    "tvheadend_pass": "",
    "jellyfin_url": "",
    "jellyfin_api_key": "",
    "timezone": "",
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


# Initialize on module import
init_database()
