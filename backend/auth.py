"""Authentication utilities for JWT token management."""

import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Annotated

from fastapi import Depends, HTTPException, status, Query
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from pydantic import BaseModel

from backend.database import get_user_by_username, verify_password

# JWT Configuration
SECRET_KEY = os.environ.get("JWT_SECRET_KEY")
if not SECRET_KEY:
    # Generate a random secret if not set (for development)
    SECRET_KEY = secrets.token_urlsafe(32)
    os.environ["JWT_SECRET_KEY"] = SECRET_KEY

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_DAYS = 7

security = HTTPBearer(auto_error=False)


class TokenData(BaseModel):
    """Token payload data."""
    user_id: str | None = None
    username: str | None = None
    role: str | None = None


class TokenResponse(BaseModel):
    """Token response model."""
    access_token: str
    token_type: str = "bearer"
    expires_in: int  # seconds


def create_access_token(data: dict[str, Any], expires_delta: timedelta | None = None) -> str:
    """Create a JWT access token."""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(days=ACCESS_TOKEN_EXPIRE_DAYS)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def decode_token(token: str) -> TokenData | None:
    """Decode and validate a JWT token."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str | None = payload.get("sub")
        username: str | None = payload.get("username")
        role: str | None = payload.get("role")
        if user_id is None:
            return None
        return TokenData(user_id=user_id, username=username, role=role)
    except JWTError:
        return None


async def get_current_user(credentials: HTTPAuthorizationCredentials | None = Depends(security)) -> TokenData:
    """Dependency to get current authenticated user from JWT token."""
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token = credentials.credentials
    token_data = decode_token(token)
    if token_data is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return token_data


async def get_current_user_optional(credentials: HTTPAuthorizationCredentials | None = Depends(security)) -> TokenData | None:
    """Dependency to optionally get current user (returns None if not authenticated)."""
    if not credentials:
        return None
    token = credentials.credentials
    return decode_token(token)


def authenticate_user(username: str, password: str) -> dict[str, Any] | None:
    """Authenticate a user with username and password."""
    user = get_user_by_username(username)
    if not user:
        return None
    if not verify_password(password, user["password_hash"]):
        return None
    return user


async def get_current_user_from_query(
    token: Annotated[str | None, Query()] = None,
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
) -> TokenData:
    """Get current user from query param (for audio playback) or header.

    This supports tokens passed as ?token=XXX query parameter for endpoints
    that need to be accessed directly by browser elements (like <audio>) which
    cannot set Authorization headers.
    """
    # Try query param first, then fall back to header
    header_token = credentials.credentials if credentials else None
    actual_token = token if token else header_token
    if not actual_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authentication token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token_data = decode_token(actual_token)
    if token_data is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return token_data
