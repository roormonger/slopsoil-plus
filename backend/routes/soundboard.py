"""Soundboard API routes for SlopSoil Web GUI.

Handles sound file management and playback triggering.
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from pydantic import BaseModel

from backend.auth import get_current_user, get_current_user_optional
from backend.database import get_setting
from backend.soundboard_storage import (
    delete_sound,
    get_sound_path,
    list_system_sounds,
    list_user_sounds,
    save_sound,
)
from backend.bot_runner import play_soundboard

log = logging.getLogger(__name__)
router = APIRouter(prefix="/soundboard")


class SoundResponse(BaseModel):
    """Response model for a sound."""
    name: str
    filename: str
    path: str


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
