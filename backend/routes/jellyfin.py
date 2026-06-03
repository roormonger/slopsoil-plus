"""Jellyfin API routes for SlopSoil Web GUI.

Handles Jellyfin media library browsing and search.
"""

import logging
from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel

from backend.bot_runner import get_bot_instance

log = logging.getLogger(__name__)
router = APIRouter(prefix="/jellyfin")


class JellyfinLibraryResponse(BaseModel):
    """Response model for a Jellyfin library."""
    Name: str
    Id: str
    Type: str
    CollectionType: str


class JellyfinItemResponse(BaseModel):
    """Response model for a Jellyfin item."""
    Id: str
    Name: str
    Type: str
    ProductionYear: int | None = None
    PremiereDate: str | None = None
    CommunityRating: float | None = None
    RunTimeTicks: int | None = None
    Overview: str | None = None
    ImageTags: dict[str, str] | None = None
    UserData: dict[str, Any] | None = None


@router.get("/libraries", response_model=list[JellyfinLibraryResponse])
async def get_jellyfin_libraries_endpoint() -> list[JellyfinLibraryResponse]:
    """Get Jellyfin media libraries."""
    from backend.bot_runner import _load_config_from_db
    bot = get_bot_instance()
    if bot is None:
        return []

    # Get Jellyfin config from database
    config = _load_config_from_db()
    if not config.get("jellyfin", {}).get("url") or not config.get("jellyfin", {}).get("api_key"):
        return []

    try:
        import aiohttp
        
        headers = {
            "Authorization": f'MediaBrowser Token="{config["jellyfin"]["api_key"]}"',
            "Content-Type": "application/json",
            "Accept": "application/json"
        }
        
        async with aiohttp.ClientSession() as session:
            # Get user ID first (required for some Jellyfin endpoints)
            user_url = f"{config['jellyfin']['url'].rstrip('/')}/Users"
            async with session.get(user_url, headers=headers) as user_response:
                if user_response.status != 200:
                    log.error(f"Failed to fetch Jellyfin users: {user_response.status}")
                    return []
                users_data = await user_response.json()
                if not users_data:
                    log.error("No users found in Jellyfin")
                    return []
                user_id = users_data[0]["Id"]
            
            # Get libraries using the user ID
            url = f"{config['jellyfin']['url'].rstrip('/')}/Users/{user_id}/Views"
            async with session.get(url, headers=headers) as response:
                if response.status == 200:
                    data = await response.json()
                    return [
                        JellyfinLibraryResponse(
                            Name=item.get("Name", ""),
                            Id=item.get("Id", ""),
                            Type=item.get("Type", ""),
                            CollectionType=item.get("CollectionType", "")
                        )
                        for item in data.get("Items", [])
                    ]
                else:
                    log.error(f"Jellyfin API returned status {response.status}")
                    return []
    except Exception as e:
        log.error(f"Failed to fetch Jellyfin libraries: {e}")
        return []


@router.get("/items/{library_id}", response_model=list[JellyfinItemResponse])
async def get_jellyfin_items_endpoint(
    library_id: str,
    sort_by: str = "Name",
    sort_order: str = "Ascending",
    search: str = ""
) -> list[JellyfinItemResponse]:
    """Get items from a Jellyfin library."""
    from backend.bot_runner import _load_config_from_db
    bot = get_bot_instance()
    if bot is None:
        return []

    # Get Jellyfin config from database
    config = _load_config_from_db()
    if not config.get("jellyfin", {}).get("url") or not config.get("jellyfin", {}).get("api_key"):
        return []

    try:
        import aiohttp
        
        headers = {
            "Authorization": f'MediaBrowser Token="{config["jellyfin"]["api_key"]}"',
            "Content-Type": "application/json",
            "Accept": "application/json"
        }
        
        async with aiohttp.ClientSession() as session:
            # Get user ID first (required for some Jellyfin endpoints)
            user_url = f"{config['jellyfin']['url'].rstrip('/')}/Users"
            async with session.get(user_url, headers=headers) as user_response:
                if user_response.status != 200:
                    log.error(f"Failed to fetch Jellyfin users: {user_response.status}")
                    return []
                users_data = await user_response.json()
                if not users_data:
                    log.error("No users found in Jellyfin")
                    return []
                user_id = users_data[0]["Id"]
            
            # Build items URL with filters
            params = {
                "SortBy": sort_by,
                "SortOrder": sort_order,
                "Recursive": "true",
                "Fields": "Overview,CommunityRating,RunTimeTicks,UserData",
                "IncludeItemTypes": "Movie,Series,Episode,MusicAlbum,MusicArtist,Book"
            }
            
            if search:
                params["SearchTerm"] = search
                params["EnableSearch"] = "true"
            
            items_url = f"{config['jellyfin']['url'].rstrip('/')}/Users/{user_id}/Items"
            if library_id != "all":
                params["ParentId"] = library_id
            
            async with session.get(items_url, headers=headers, params=params) as response:
                if response.status == 200:
                    data = await response.json()
                    return [
                        JellyfinItemResponse(
                            Id=item.get("Id", ""),
                            Name=item.get("Name", ""),
                            Type=item.get("Type", ""),
                            ProductionYear=item.get("ProductionYear"),
                            PremiereDate=item.get("PremiereDate"),
                            CommunityRating=item.get("CommunityRating"),
                            RunTimeTicks=item.get("RunTimeTicks"),
                            Overview=item.get("Overview"),
                            ImageTags=item.get("ImageTags"),
                            UserData=item.get("UserData")
                        )
                        for item in data.get("Items", [])
                    ]
                else:
                    log.error(f"Jellyfin items API returned status {response.status}")
                    return []
    except Exception as e:
        log.error(f"Failed to fetch Jellyfin items: {e}")
        return []
