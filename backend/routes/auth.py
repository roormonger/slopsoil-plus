"""Authentication API routes for SlopSoil Web GUI.

Handles login, JWT token generation, and current user profile.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from backend.auth import create_access_token, get_current_user, TokenData, TokenResponse
from backend.database import (
    authenticate_user,
    get_user_by_user_id,
    UserResponse,
)

router = APIRouter(prefix="/auth")


class LoginRequest(BaseModel):
    """Login request model."""
    username: str
    password: str


@router.post("/login", response_model=TokenResponse)
async def login(request: LoginRequest):
    """Authenticate user and return JWT token."""
    user = authenticate_user(request.username, request.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    access_token = create_access_token(
        data={
            "sub": str(user["user_id"]),
            "username": user["username"],
            "role": user["role"],
        }
    )
    
    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        expires_in=7 * 24 * 60 * 60,  # 7 days in seconds
    )


@router.get("/me", response_model=UserResponse)
async def get_current_user_info(current_user: TokenData = Depends(get_current_user)):
    """Get current authenticated user profile."""
    user = get_user_by_user_id(current_user.user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return UserResponse(**user)
