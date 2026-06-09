"""Soundboard API routes for SlopSoil Web GUI.

Handles sound file management and playback triggering.
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel

from backend.auth import get_current_user, get_current_user_optional, get_current_user_from_query
from backend.database import get_setting
from backend.soundboard_storage import (
    delete_sound,
    get_cover_art_bytes,
    get_sound_path,
    list_system_sounds,
    list_user_ids_with_sounds,
    list_user_sounds,
    rename_sound,
    save_sound,
    set_cover_art,
    set_sound_tags,
)
from backend.bot_runner import play_soundboard

log = logging.getLogger(__name__)
router = APIRouter(prefix="/soundboard")


class SoundResponse(BaseModel):
    """Response model for a sound."""
    name: str
    filename: str
    path: str
    tags: list[str] = []
    duration: float | None = None
    has_cover_art: bool = False


class TagsResponse(BaseModel):
    """Response model for sound tags."""
    tags: list[str]


class TagsUpdateRequest(BaseModel):
    """Request model for updating tags."""
    tags: list[str]  # Array of tag strings


class PlayRequest(BaseModel):
    """Request model for playing a sound."""
    filename: str
    type: str  # "system" or "personal"
    guild_id: str | None = None
    channel_id: str | None = None


class PlayResponse(BaseModel):
    """Response model for play action."""
    success: bool
    message: str


class UploadResponse(BaseModel):
    """Response model for upload action."""
    message: str
    filename: str


class DeleteResponse(BaseModel):
    """Response model for delete action."""
    message: str


@router.get("/system", response_model=list[SoundResponse])
async def get_system_sounds() -> list[SoundResponse]:
    """Get all system soundboard sounds."""
    sounds = list_system_sounds()
    return [SoundResponse(**s) for s in sounds]


@router.get("/mine", response_model=list[SoundResponse])
async def get_my_sounds(
    current_user=Depends(get_current_user),
) -> list[SoundResponse]:
    """Get the current user's personal sounds."""
    sounds = list_user_sounds(current_user.user_id)
    return [SoundResponse(**s) for s in sounds]


@router.post("/system", response_model=UploadResponse)
async def upload_system_sound(
    file: UploadFile,
    current_user=Depends(get_current_user),
) -> UploadResponse:
    """Upload a system sound (admin only)."""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")

    data = await file.read()
    try:
        save_sound(file.filename, data, user_id=None)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return UploadResponse(
        message="System sound uploaded",
        filename=file.filename,
    )


@router.post("/mine", response_model=UploadResponse)
async def upload_personal_sound(
    file: UploadFile,
    current_user=Depends(get_current_user),
) -> UploadResponse:
    """Upload a personal sound."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")

    # Check quota
    quota_raw = get_setting("soundboard_user_quota")
    try:
        quota = int(quota_raw) if quota_raw else 10
    except (ValueError, TypeError):
        quota = 10

    existing = list_user_sounds(current_user.user_id)
    if len(existing) >= quota:
        raise HTTPException(
            status_code=400,
            detail=f"Upload quota reached ({quota} files). Delete a sound first.",
        )

    data = await file.read()
    try:
        save_sound(file.filename, data, user_id=current_user.user_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return UploadResponse(
        message="Personal sound uploaded",
        filename=file.filename,
    )


@router.delete("/system/{filename}", response_model=DeleteResponse)
async def delete_system_sound(
    filename: str,
    current_user=Depends(get_current_user),
) -> DeleteResponse:
    """Delete a system sound (admin only)."""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    deleted = delete_sound(filename, user_id=None)
    if not deleted:
        raise HTTPException(status_code=404, detail="Sound not found")

    return DeleteResponse(message="System sound deleted")


@router.delete("/mine/{filename}", response_model=DeleteResponse)
async def delete_personal_sound(
    filename: str,
    current_user=Depends(get_current_user),
) -> DeleteResponse:
    """Delete a personal sound."""
    deleted = delete_sound(filename, user_id=current_user.user_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Sound not found")

    return DeleteResponse(message="Personal sound deleted")


# Tag management endpoints
@router.get("/system/{filename}/tags", response_model=TagsResponse)
async def get_system_sound_tags(
    filename: str,
    current_user=Depends(get_current_user),
) -> TagsResponse:
    """Get tags for a system sound."""
    from backend.soundboard_storage import get_sound_tags
    path = get_sound_path(filename, user_id=None)
    if not path:
        raise HTTPException(status_code=404, detail="Sound not found")
    tags = get_sound_tags(path)
    return TagsResponse(tags=tags)


@router.get("/mine/{filename}/tags", response_model=TagsResponse)
async def get_personal_sound_tags(
    filename: str,
    current_user=Depends(get_current_user),
) -> TagsResponse:
    """Get tags for a personal sound."""
    from backend.soundboard_storage import get_sound_tags
    path = get_sound_path(filename, user_id=current_user.user_id)
    if not path:
        raise HTTPException(status_code=404, detail="Sound not found")
    tags = get_sound_tags(path)
    return TagsResponse(tags=tags)


@router.post("/system/{filename}/tags", response_model=TagsResponse)
async def set_system_sound_tags(
    filename: str,
    request: TagsUpdateRequest,
    current_user=Depends(get_current_user),
) -> TagsResponse:
    """Set tags for a system sound (admin only)."""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    path = get_sound_path(filename, user_id=None)
    if not path:
        raise HTTPException(status_code=404, detail="Sound not found")
    success = set_sound_tags(path, request.tags)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to set tags")
    return TagsResponse(tags=request.tags)


@router.post("/mine/{filename}/tags", response_model=TagsResponse)
async def set_personal_sound_tags(
    filename: str,
    request: TagsUpdateRequest,
    current_user=Depends(get_current_user),
) -> TagsResponse:
    """Set tags for a personal sound."""
    path = get_sound_path(filename, user_id=current_user.user_id)
    if not path:
        raise HTTPException(status_code=404, detail="Sound not found")
    success = set_sound_tags(path, request.tags)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to set tags")
    return TagsResponse(tags=request.tags)


# Cover art serving
@router.get("/system/{filename}/cover")
async def serve_system_cover(
    filename: str,
    current_user=Depends(get_current_user_from_query),
):
    """Serve embedded cover art for a system sound."""
    path = get_sound_path(filename, user_id=None)
    if not path:
        raise HTTPException(status_code=404, detail="Sound not found")
    result = get_cover_art_bytes(path)
    if not result:
        raise HTTPException(status_code=404, detail="No cover art")
    data, mime = result
    from fastapi.responses import Response
    return Response(content=data, media_type=mime)


@router.get("/mine/{filename}/cover")
async def serve_personal_cover(
    filename: str,
    current_user=Depends(get_current_user_from_query),
):
    """Serve embedded cover art for a personal sound."""
    path = get_sound_path(filename, user_id=current_user.user_id)
    if not path:
        raise HTTPException(status_code=404, detail="Sound not found")
    result = get_cover_art_bytes(path)
    if not result:
        raise HTTPException(status_code=404, detail="No cover art")
    data, mime = result
    from fastapi.responses import Response
    return Response(content=data, media_type=mime)


@router.post("/mine/{filename}/cover")
async def set_personal_cover(
    filename: str,
    file: UploadFile = File(...),
    current_user=Depends(get_current_user),
):
    """Embed cover art into a personal sound file."""
    path = get_sound_path(filename, user_id=current_user.user_id)
    if not path:
        raise HTTPException(status_code=404, detail="Sound not found")
    data = await file.read()
    mime = file.content_type or "image/jpeg"
    ok = set_cover_art(path, data, mime)
    if not ok:
        raise HTTPException(status_code=400, detail="Failed to write cover art (format may not be supported)")
    return {"ok": True}


class RenameRequest(BaseModel):
    """Request body for renaming a sound."""
    new_name: str


@router.post("/mine/{filename}/rename", response_model=SoundResponse)
async def rename_personal_sound(
    filename: str,
    request: RenameRequest,
    current_user=Depends(get_current_user),
) -> SoundResponse:
    """Rename a personal sound file."""
    path = get_sound_path(filename, user_id=current_user.user_id)
    if not path:
        raise HTTPException(status_code=404, detail="Sound not found")
    new_path = rename_sound(path, request.new_name.strip())
    if not new_path:
        raise HTTPException(status_code=400, detail="Rename failed — name may already be taken or invalid")
    from backend.soundboard_storage import get_sound_tags, get_sound_duration, has_cover_art
    return SoundResponse(
        name=new_path.stem,
        filename=new_path.name,
        path=str(new_path),
        tags=get_sound_tags(new_path),
        duration=get_sound_duration(new_path),
        has_cover_art=has_cover_art(new_path),
    )


@router.post("/system/{filename}/cover")
async def set_system_cover(
    filename: str,
    file: UploadFile = File(...),
    current_user=Depends(get_current_user),
):
    """Embed cover art into a system sound file (admin only)."""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    path = get_sound_path(filename, user_id=None)
    if not path:
        raise HTTPException(status_code=404, detail="Sound not found")
    data = await file.read()
    mime = file.content_type or "image/jpeg"
    ok = set_cover_art(path, data, mime)
    if not ok:
        raise HTTPException(status_code=400, detail="Failed to write cover art (format may not be supported)")
    return {"ok": True}


@router.post("/system/{filename}/rename", response_model=SoundResponse)
async def rename_system_sound(
    filename: str,
    request: RenameRequest,
    current_user=Depends(get_current_user),
) -> SoundResponse:
    """Rename a system sound file (admin only)."""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    path = get_sound_path(filename, user_id=None)
    if not path:
        raise HTTPException(status_code=404, detail="Sound not found")
    new_path = rename_sound(path, request.new_name.strip())
    if not new_path:
        raise HTTPException(status_code=400, detail="Rename failed — name may already be taken or invalid")
    from backend.soundboard_storage import get_sound_tags, get_sound_duration, has_cover_art
    return SoundResponse(
        name=new_path.stem,
        filename=new_path.name,
        path=str(new_path),
        tags=get_sound_tags(new_path),
        duration=get_sound_duration(new_path),
        has_cover_art=has_cover_art(new_path),
    )


# Audio file serving for browser playback
@router.get("/system/{filename}/audio")
async def serve_system_audio(
    filename: str,
    current_user=Depends(get_current_user_from_query),
):
    """Serve audio file for browser playback (admin only)."""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    path = get_sound_path(filename, user_id=None)
    if not path:
        raise HTTPException(status_code=404, detail="Sound not found")
    from fastapi.responses import FileResponse
    return FileResponse(path, media_type="audio/mpeg", filename=filename)


@router.get("/mine/{filename}/audio")
async def serve_personal_audio(
    filename: str,
    current_user=Depends(get_current_user_from_query),
):
    """Serve audio file for browser playback."""
    path = get_sound_path(filename, user_id=current_user.user_id)
    if not path:
        raise HTTPException(status_code=404, detail="Sound not found")
    from fastapi.responses import FileResponse
    return FileResponse(path, media_type="audio/mpeg", filename=filename)


class UserWithSoundsResponse(BaseModel):
    """A non-admin user who has personal soundboard files."""
    user_id: str
    username: str


@router.get("/users-with-sounds", response_model=list[UserWithSoundsResponse])
async def get_users_with_sounds(
    current_user=Depends(get_current_user),
) -> list[UserWithSoundsResponse]:
    """Return non-admin users who have at least one personal sound (admin only)."""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    from backend.database import get_user_by_user_id
    user_ids = list_user_ids_with_sounds()
    result = []
    for uid in sorted(user_ids):
        user = get_user_by_user_id(uid)
        if user and user["role"] != "admin":
            result.append(UserWithSoundsResponse(user_id=uid, username=user["username"]))
    return result


# Admin endpoints for managing other users' personal soundboards
@router.get("/users/{target_user_id}", response_model=list[SoundResponse])
async def get_user_sounds_admin(
    target_user_id: str,
    current_user=Depends(get_current_user),
) -> list[SoundResponse]:
    """Get sounds for a specific user (admin only). Admins cannot view other admins' sounds."""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    from backend.database import get_user_by_user_id
    target = get_user_by_user_id(target_user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target["role"] == "admin":
        raise HTTPException(status_code=403, detail="Cannot manage another admin's soundboard")
    sounds = list_user_sounds(target_user_id)
    return [SoundResponse(**s) for s in sounds]


@router.post("/users/{target_user_id}/{filename}/tags", response_model=TagsResponse)
async def set_user_sound_tags_admin(
    target_user_id: str,
    filename: str,
    request: TagsUpdateRequest,
    current_user=Depends(get_current_user),
) -> TagsResponse:
    """Set tags for a user's sound (admin only)."""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    from backend.database import get_user_by_user_id
    target = get_user_by_user_id(target_user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target["role"] == "admin":
        raise HTTPException(status_code=403, detail="Cannot manage another admin's soundboard")
    path = get_sound_path(filename, user_id=target_user_id)
    if not path:
        raise HTTPException(status_code=404, detail="Sound not found")
    success = set_sound_tags(path, request.tags)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to set tags")
    return TagsResponse(tags=request.tags)


@router.delete("/users/{target_user_id}/{filename}", response_model=DeleteResponse)
async def delete_user_sound_admin(
    target_user_id: str,
    filename: str,
    current_user=Depends(get_current_user),
) -> DeleteResponse:
    """Delete a user's sound (admin only)."""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    from backend.database import get_user_by_user_id
    target = get_user_by_user_id(target_user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target["role"] == "admin":
        raise HTTPException(status_code=403, detail="Cannot manage another admin's soundboard")
    deleted = delete_sound(filename, user_id=target_user_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Sound not found")
    return DeleteResponse(message="Sound deleted")


@router.post("/users/{target_user_id}/{filename}/cover")
async def set_user_cover_admin(
    target_user_id: str,
    filename: str,
    file: UploadFile = File(...),
    current_user=Depends(get_current_user),
):
    """Embed cover art into a user's sound file (admin only)."""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    from backend.database import get_user_by_user_id
    target = get_user_by_user_id(target_user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target["role"] == "admin":
        raise HTTPException(status_code=403, detail="Cannot manage another admin's soundboard")
    path = get_sound_path(filename, user_id=target_user_id)
    if not path:
        raise HTTPException(status_code=404, detail="Sound not found")
    data = await file.read()
    mime = file.content_type or "image/jpeg"
    ok = set_cover_art(path, data, mime)
    if not ok:
        raise HTTPException(status_code=400, detail="Failed to write cover art (format may not be supported)")
    return {"ok": True}


@router.post("/users/{target_user_id}/{filename}/rename", response_model=SoundResponse)
async def rename_user_sound_admin(
    target_user_id: str,
    filename: str,
    request: RenameRequest,
    current_user=Depends(get_current_user),
) -> SoundResponse:
    """Rename a user's sound file (admin only)."""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    from backend.database import get_user_by_user_id
    target = get_user_by_user_id(target_user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target["role"] == "admin":
        raise HTTPException(status_code=403, detail="Cannot manage another admin's soundboard")
    path = get_sound_path(filename, user_id=target_user_id)
    if not path:
        raise HTTPException(status_code=404, detail="Sound not found")
    new_path = rename_sound(path, request.new_name.strip())
    if not new_path:
        raise HTTPException(status_code=400, detail="Rename failed — name may already be taken or invalid")
    from backend.soundboard_storage import get_sound_tags, get_sound_duration, has_cover_art
    return SoundResponse(
        name=new_path.stem,
        filename=new_path.name,
        path=str(new_path),
        tags=get_sound_tags(new_path),
        duration=get_sound_duration(new_path),
        has_cover_art=has_cover_art(new_path),
    )


@router.get("/users/{target_user_id}/{filename}/cover")
async def serve_user_cover_admin(
    target_user_id: str,
    filename: str,
    current_user=Depends(get_current_user_from_query),
):
    """Serve cover art for a user's sound (admin only)."""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    path = get_sound_path(filename, user_id=target_user_id)
    if not path:
        raise HTTPException(status_code=404, detail="Sound not found")
    result = get_cover_art_bytes(path)
    if not result:
        raise HTTPException(status_code=404, detail="No cover art")
    data, mime = result
    from fastapi.responses import Response
    return Response(content=data, media_type=mime)


@router.get("/users/{target_user_id}/{filename}/audio")
async def serve_user_audio_admin(
    target_user_id: str,
    filename: str,
    current_user=Depends(get_current_user_from_query),
):
    """Serve audio for a user's sound (admin only)."""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    path = get_sound_path(filename, user_id=target_user_id)
    if not path:
        raise HTTPException(status_code=404, detail="Sound not found")
    from fastapi.responses import FileResponse
    return FileResponse(path, media_type="audio/mpeg", filename=filename)


@router.post("/play", response_model=PlayResponse)
async def play_sound_endpoint(
    request: PlayRequest,
    current_user=Depends(get_current_user),
) -> PlayResponse:
    """Play a sound in the bot's current voice channel."""
    user_id = None if request.type == "system" else current_user.user_id
    filepath = get_sound_path(request.filename, user_id)
    if not filepath:
        raise HTTPException(status_code=404, detail="Sound not found")

    if not request.guild_id:
        raise HTTPException(status_code=400, detail="guild_id is required")

    try:
        result = await play_soundboard(str(filepath), int(request.guild_id), request.channel_id)
        return PlayResponse(success=result.get("success", False), message=result.get("message", ""))
    except Exception as exc:
        log.error("Failed to play soundboard: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc
