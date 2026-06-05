"""Soundboard file storage for SlopSoil.

Manages on-disk audio files for system and per-user soundboards.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

log = logging.getLogger(__name__)

SOUNDBOARD_DIR = Path("/app/soundboard")
SYSTEM_DIR = SOUNDBOARD_DIR / "system"
USERS_DIR = SOUNDBOARD_DIR / "users"

_ALLOWED_EXTS = {"mp3", "wav", "ogg", "flac", "m4a", "webm", "opus"}


def _scan_dir(directory: Path) -> list[dict[str, Any]]:
    """Scan a directory for supported audio files."""
    if not directory.exists():
        return []
    sounds = []
    for path in sorted(directory.iterdir()):
        if path.is_file() and path.suffix.lstrip(".").lower() in _ALLOWED_EXTS:
            sounds.append(
                {
                    "name": path.stem,
                    "filename": path.name,
                    "path": str(path),
                }
            )
    return sounds


def list_system_sounds() -> list[dict[str, Any]]:
    """Return all system-level soundboard files."""
    return _scan_dir(SYSTEM_DIR)


def list_user_sounds(user_id: str) -> list[dict[str, Any]]:
    """Return all sounds for a given user."""
    user_dir = USERS_DIR / user_id
    return _scan_dir(user_dir)


def _get_target_dir(user_id: str | None) -> Path:
    """Return the target directory for a sound."""
    if user_id is None:
        return SYSTEM_DIR
    user_dir = USERS_DIR / user_id
    user_dir.mkdir(parents=True, exist_ok=True)
    return user_dir


def save_sound(filename: str, data: bytes, user_id: str | None = None) -> Path:
    """Save an uploaded sound file.

    Args:
        filename: The original filename.
        data: Raw file bytes.
        user_id: If None, save to system dir; otherwise save to user's dir.

    Returns:
        The path the file was saved to.

    Raises:
        ValueError: If the file extension is not allowed.
    """
    ext = Path(filename).suffix.lstrip(".").lower()
    if ext not in _ALLOWED_EXTS:
        allowed = ", ".join(sorted(_ALLOWED_EXTS))
        raise ValueError(f"Unsupported file type '{ext}'. Allowed: {allowed}")

    target_dir = _get_target_dir(user_id)
    # Sanitize filename — keep only basename to avoid path traversal
    safe_name = Path(filename).name
    target_path = target_dir / safe_name

    target_path.write_bytes(data)
    log.info("Saved soundboard file: %s", target_path)
    return target_path


def delete_sound(filename: str, user_id: str | None = None) -> bool:
    """Delete a sound file.

    Args:
        filename: The filename to delete.
        user_id: If None, delete from system dir; otherwise delete from user's dir.

    Returns:
        True if the file existed and was deleted, False otherwise.
    """
    target_dir = _get_target_dir(user_id)
    safe_name = Path(filename).name
    target_path = target_dir / safe_name

    if not target_path.exists():
        return False

    target_path.unlink()
    log.info("Deleted soundboard file: %s", target_path)
    return True


def get_sound_path(filename: str, user_id: str | None = None) -> Path | None:
    """Resolve the absolute path for a sound file.

    Returns:
        The path if it exists, otherwise None.
    """
    target_dir = _get_target_dir(user_id)
    safe_name = Path(filename).name
    target_path = target_dir / safe_name
    return target_path if target_path.exists() else None
