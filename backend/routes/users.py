"""User management API routes for SlopSoil Web GUI.

Handles user CRUD operations and user profile management.
"""

import json
import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.database import (
    create_user,
    delete_user,
    get_all_users,
    get_user_by_discord_id,
    get_user_by_user_id,
    get_user_by_username,
    hash_password,
    update_user,
    UserResponse,
)

log = logging.getLogger(__name__)
router = APIRouter(prefix="/users")


class UserCreateRequest(BaseModel):
    """Request model for creating a user."""
    username: str
    password: str
    role: str = "user"
    avatar: str | None = None
    discord_id: str | None = None


class UserUpdateRequest(BaseModel):
    """Request model for updating a user."""
    username: str | None = None
    avatar: str | None = None
    discord_id: str | None = None
    role: str | None = None
    bookmarks_video: list | None = None
    bookmarks_voice: list | None = None


class UserActionResponse(BaseModel):
    """Response model for user actions."""
    message: str


@router.get("", response_model=list[UserResponse])
@router.get("/", response_model=list[UserResponse])
async def get_users(role: str | None = None):
    """Get all users, optionally filtered by role."""
    try:
        users = get_all_users(role_filter=role)
        return [UserResponse(**user) for user in users]
    except Exception as e:
        log.error(f"Failed to get users: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve users")


@router.post("/", response_model=UserResponse)
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
        password_hash = hash_password(user_request.password)
        
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


@router.get("/{user_id}", response_model=UserResponse)
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


@router.put("/{user_id}", response_model=UserResponse)
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


@router.delete("/{user_id}")
async def delete_user_endpoint(user_id: str):
    """Delete user by ID."""
    try:
        # Check if user exists
        existing_user = get_user_by_user_id(user_id)
        if not existing_user:
            raise HTTPException(status_code=404, detail="User not found")
        
        success = delete_user(user_id)
        if not success:
            raise HTTPException(status_code=500, detail="Failed to delete user")
        
        return {"message": "User deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        log.error(f"Failed to delete user: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete user")
