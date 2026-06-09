"""Soundboard file storage for SlopSoil.

Manages on-disk audio files for system and per-user soundboards.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

try:
    from mutagen.mp3 import MP3
    from mutagen.flac import FLAC
    from mutagen.oggvorbis import OggVorbis
    from mutagen.wave import WAVE
    from mutagen.id3 import ID3, TXXX, APIC
    MUTAGEN_AVAILABLE = True
except ImportError:
    MUTAGEN_AVAILABLE = False
    MP3 = FLAC = OggVorbis = WAVE = ID3 = TXXX = APIC = None

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
                    "tags": get_sound_tags(path),
                    "duration": get_sound_duration(path),
                    "has_cover_art": has_cover_art(path),
                }
            )
    return sounds


def list_system_sounds() -> list[dict[str, Any]]:
    """Return all system-level soundboard files."""
    return _scan_dir(SYSTEM_DIR)


def list_user_ids_with_sounds() -> list[str]:
    """Return user_ids (folder names) that have at least one audio file."""
    if not USERS_DIR.exists():
        return []
    result = []
    for folder in USERS_DIR.iterdir():
        if folder.is_dir():
            has_audio = any(
                f.is_file() and f.suffix.lstrip(".").lower() in _ALLOWED_EXTS
                for f in folder.iterdir()
            )
            if has_audio:
                result.append(folder.name)
    return result


def list_user_sounds(user_id: str) -> list[dict[str, Any]]:
    """Return all sounds for a given user."""
    user_dir = USERS_DIR / user_id
    return _scan_dir(user_dir)


def _get_target_dir(user_id: str | None) -> Path:
    """Return the target directory for a sound."""
    if user_id is None:
        SYSTEM_DIR.mkdir(parents=True, exist_ok=True)
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


def _get_audio_file(filepath: Path) -> Any | None:
    """Get mutagen File object for an audio file."""
    if not MUTAGEN_AVAILABLE:
        return None
    try:
        ext = filepath.suffix.lower()
        if ext == ".mp3":
            return MP3(filepath)
        elif ext == ".flac":
            return FLAC(filepath)
        elif ext in (".ogg", ".opus"):
            return OggVorbis(filepath)
        elif ext == ".wav":
            return WAVE(filepath)
        return None
    except Exception:
        return None


def get_sound_tags(filepath: Path | str) -> list[str]:
    """Read ID3 tags from audio file.

    Returns list of tags from the 'bot-tag' custom field.
    """
    path = Path(filepath)
    audio = _get_audio_file(path)
    if audio is None:
        return []

    try:
        # For MP3, look in ID3 tags
        if path.suffix.lower() == ".mp3" and audio.tags:
            for key in audio.tags.keys():
                if key.startswith("TXXX:") and "bot-tag" in key.lower():
                    value = str(audio.tags[key])
                    return [t.strip().lower() for t in value.split(",") if t.strip()]
            # Also check TXXX frames directly
            if hasattr(audio.tags, "getall"):
                for frame in audio.tags.getall("TXXX"):
                    if hasattr(frame, "desc") and "bot-tag" in frame.desc.lower():
                        values = str(frame).split("\x00") if hasattr(frame, "text") else str(frame).split(",")
                        return [t.strip().lower() for t in values if t.strip()]
        # For other formats (FLAC, OGG), look in metadata
        elif hasattr(audio, "tags") and audio.tags:
            for key in audio.tags.keys():
                if "bot-tag" in key.lower():
                    value = audio.tags[key]
                    if isinstance(value, list):
                        tags = []
                        for v in value:
                            tags.extend([t.strip().lower() for t in str(v).split(",") if t.strip()])
                        return tags
                    else:
                        return [t.strip().lower() for t in str(value).split(",") if t.strip()]
    except Exception as e:
        log.debug("Error reading tags from %s: %s", filepath, e)
    return []


def set_sound_tags(filepath: Path | str, tags: list[str]) -> bool:
    """Write ID3 tags to audio file.

    Args:
        filepath: Path to audio file
        tags: List of tag strings to store (will be saved as comma-separated)

    Returns:
        True if successful, False otherwise
    """
    if not MUTAGEN_AVAILABLE:
        log.warning("mutagen not available, cannot set tags")
        return False

    path = Path(filepath)
    audio = _get_audio_file(path)
    if audio is None:
        return False

    try:
        # Clean and format tags
        clean_tags = [t.strip().lower() for t in tags if t.strip()]
        tag_value = ",".join(clean_tags)

        # For MP3, use ID3 TXXX frame
        if path.suffix.lower() == ".mp3":
            if audio.tags is None:
                audio.add_tags()
            # Remove existing bot-tag frames
            if hasattr(audio.tags, "getall"):
                for frame in list(audio.tags.getall("TXXX")):
                    if hasattr(frame, "desc") and frame.desc == "bot-tag":
                        audio.tags.delall(frame.HashKey)
            # Add new tag
            if TXXX:
                audio.tags["TXXX:bot-tag"] = TXXX(encoding=3, desc="bot-tag", text=tag_value)
        # For FLAC/OGG
        elif hasattr(audio, "tags"):
            audio.tags["bot-tag"] = tag_value

        audio.save()
        return True
    except Exception as e:
        log.error("Error writing tags to %s: %s", filepath, e)
        return False


def get_sound_duration(filepath: Path | str) -> float | None:
    """Get audio file duration in seconds.

    Returns:
        Duration in seconds, or None if unavailable
    """
    audio = _get_audio_file(Path(filepath))
    if audio is None:
        return None
    try:
        if hasattr(audio, "info") and hasattr(audio.info, "length"):
            return float(audio.info.length)
    except Exception:
        pass
    return None


def get_cover_art_bytes(filepath: Path | str) -> tuple[bytes, str] | None:
    """Extract embedded cover art from an audio file.

    Returns:
        Tuple of (image_bytes, mime_type) or None if no cover art found.
    """
    if not MUTAGEN_AVAILABLE:
        return None

    path = Path(filepath)
    try:
        ext = path.suffix.lower()
        if ext == ".mp3":
            audio = MP3(path)
            if audio.tags:
                for key in audio.tags.keys():
                    if key.startswith("APIC"):
                        frame = audio.tags[key]
                        if hasattr(frame, "data") and frame.data:
                            mime = getattr(frame, "mime", "image/jpeg") or "image/jpeg"
                            return (frame.data, mime)
        elif ext == ".flac":
            audio = FLAC(path)
            if audio.pictures:
                pic = audio.pictures[0]
                return (pic.data, pic.mime or "image/jpeg")
        elif ext in (".ogg", ".opus"):
            import base64
            audio = OggVorbis(path)
            if audio.tags and "metadata_block_picture" in audio.tags:
                import struct
                raw = base64.b64decode(audio.tags["metadata_block_picture"][0])
                mime_len = struct.unpack(">I", raw[4:8])[0]
                mime = raw[8:8 + mime_len].decode("utf-8", errors="ignore")
                desc_len = struct.unpack(">I", raw[8 + mime_len:12 + mime_len])[0]
                offset = 12 + mime_len + desc_len + 16
                data_len = struct.unpack(">I", raw[offset:offset + 4])[0]
                data = raw[offset + 4:offset + 4 + data_len]
                return (data, mime)
    except Exception as e:
        log.debug("Error reading cover art from %s: %s", filepath, e)
    return None


def has_cover_art(filepath: Path | str) -> bool:
    """Return True if the audio file has embedded cover art."""
    return get_cover_art_bytes(filepath) is not None


def set_cover_art(filepath: Path | str, image_bytes: bytes, mime_type: str = "image/jpeg") -> bool:
    """Embed cover art into an audio file.

    Supports MP3, FLAC, and OGG/Opus.

    Returns:
        True if successful, False otherwise.
    """
    if not MUTAGEN_AVAILABLE:
        log.warning("mutagen not available, cannot set cover art")
        return False

    path = Path(filepath)
    try:
        ext = path.suffix.lower()
        if ext == ".mp3":
            audio = MP3(path)
            if audio.tags is None:
                audio.add_tags()
            # Remove existing APIC frames
            audio.tags.delall("APIC")
            audio.tags["APIC:"] = APIC(
                encoding=3,
                mime=mime_type,
                type=3,  # Cover (front)
                desc="Cover",
                data=image_bytes,
            )
            audio.save()
            return True
        elif ext == ".flac":
            from mutagen.flac import Picture
            audio = FLAC(path)
            audio.clear_pictures()
            pic = Picture()
            pic.type = 3
            pic.mime = mime_type
            pic.desc = "Cover"
            pic.data = image_bytes
            audio.add_picture(pic)
            audio.save()
            return True
        elif ext in (".ogg", ".opus"):
            import base64
            import struct
            audio = OggVorbis(path)
            from mutagen.flac import Picture
            pic = Picture()
            pic.type = 3
            pic.mime = mime_type
            pic.desc = "Cover"
            pic.data = image_bytes
            audio.tags["metadata_block_picture"] = [
                base64.b64encode(pic.write()).decode("ascii")
            ]
            audio.save()
            return True
        else:
            log.warning("Cover art writing not supported for %s", ext)
            return False
    except Exception as e:
        log.error("Error writing cover art to %s: %s", filepath, e)
        return False


def rename_sound(filepath: Path | str, new_stem: str) -> Path | None:
    """Rename an audio file, keeping its extension and directory.

    Returns:
        The new Path if successful, None otherwise.
    """
    path = Path(filepath)
    if not path.exists():
        return None
    # Sanitize: strip slashes, dots at start
    safe_stem = new_stem.strip().lstrip(".")
    if not safe_stem:
        return None
    new_path = path.with_stem(safe_stem)
    if new_path.exists() and new_path != path:
        return None  # Would overwrite another file
    try:
        path.rename(new_path)
        log.info("Renamed soundboard file: %s -> %s", path, new_path)
        return new_path
    except Exception as e:
        log.error("Error renaming %s to %s: %s", path, new_path, e)
        return None
