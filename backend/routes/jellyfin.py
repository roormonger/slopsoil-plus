"""Jellyfin API routes for SlopSoil Web GUI.

Handles Jellyfin media library browsing and search.
"""

from __future__ import annotations

import logging
from typing import Any

import aiohttp
from fastapi import APIRouter
from pydantic import BaseModel

log = logging.getLogger(__name__)
router = APIRouter(prefix="/jellyfin")

_REQUEST_TIMEOUT = aiohttp.ClientTimeout(total=60, connect=5)


class _JellyfinBackendClient:
    """Singleton HTTP client for Jellyfin backend routes.

    Keeps a single persistent aiohttp.ClientSession so TCP connections are
    reused across requests (connection pooling).  The Jellyfin user_id is
    fetched once and cached; it is invalidated if the configured URL or API
    key changes so a settings update is picked up transparently.
    """

    def __init__(self) -> None:
        self._session: aiohttp.ClientSession | None = None
        self._user_id: str | None = None
        self._cached_url: str = ""
        self._cached_key: str = ""

    def _get_config(self) -> tuple[str, str] | None:
        """Return (base_url, api_key) from DB, or None if not configured."""
        from backend.bot_runner import _load_config_from_db
        config = _load_config_from_db()
        url = config.get("jellyfin", {}).get("url", "").rstrip("/")
        key = config.get("jellyfin", {}).get("api_key", "")
        if not url or not key:
            return None
        return url, key

    def _headers(self, api_key: str) -> dict[str, str]:
        return {
            "Authorization": f'MediaBrowser Token="{api_key}"',
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

    def _invalidate_if_config_changed(self, url: str, key: str) -> None:
        """Drop cached user_id if the Jellyfin URL or key changed."""
        if url != self._cached_url or key != self._cached_key:
            log.debug("Jellyfin config changed — invalidating cached user_id")
            self._user_id = None
            self._cached_url = url
            self._cached_key = key

    async def _get_session(self) -> aiohttp.ClientSession:
        """Return the shared session, creating it if necessary."""
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession(timeout=_REQUEST_TIMEOUT)
        return self._session

    async def _get_user_id(self, url: str, api_key: str) -> str | None:
        """Return cached Jellyfin user_id, preferring the admin user."""
        if self._user_id is not None:
            return self._user_id
        session = await self._get_session()
        try:
            async with session.get(f"{url}/Users", headers=self._headers(api_key)) as resp:
                if resp.status != 200:
                    log.error("Jellyfin /Users returned %s", resp.status)
                    return None
                users = await resp.json()
                if not users:
                    log.error("Jellyfin returned empty user list")
                    return None
                admin = next((u for u in users if u.get("Policy", {}).get("IsAdministrator")), None)
                chosen = admin or users[0]
                self._user_id = chosen["Id"]
                log.info("Jellyfin: cached user_id %s (admin=%s)", self._user_id, admin is not None)
                return self._user_id
        except Exception as exc:
            log.error("Jellyfin: failed to fetch user list: %s", exc)
            return None

    async def get_libraries(self) -> list[dict]:
        cfg = self._get_config()
        if cfg is None:
            return []
        url, key = cfg
        self._invalidate_if_config_changed(url, key)
        user_id = await self._get_user_id(url, key)
        if user_id is None:
            return []
        session = await self._get_session()
        try:
            async with session.get(
                f"{url}/Users/{user_id}/Views",
                headers=self._headers(key),
            ) as resp:
                if resp.status != 200:
                    log.error("Jellyfin /Views returned %s", resp.status)
                    return []
                data = await resp.json()
                items = data.get("Items", [])
                log.info("Jellyfin libraries: %s", [(i.get("Name"), i.get("CollectionType")) for i in items])
                return items
        except Exception as exc:
            log.error("Jellyfin: get_libraries failed: %s", exc)
            return []

    async def get_items(
        self,
        library_id: str,
        sort_by: str,
        sort_order: str,
        search: str,
        limit: int = 50,
        start_index: int = 0,
        include_item_types: str = "Movie,Series,Episode,MusicAlbum,MusicArtist,Book",
    ) -> dict:
        cfg = self._get_config()
        if cfg is None:
            return {"items": [], "total": 0}
        url, key = cfg
        self._invalidate_if_config_changed(url, key)
        user_id = await self._get_user_id(url, key)
        if user_id is None:
            return {"items": [], "total": 0}
        params: dict[str, str] = {
            "SortBy": sort_by,
            "SortOrder": sort_order,
            "Recursive": "true",
            "Fields": "Overview,CommunityRating,RunTimeTicks,UserData",
            "IncludeItemTypes": include_item_types,
            "Limit": str(limit),
            "StartIndex": str(start_index),
        }
        if library_id != "all":
            params["ParentId"] = library_id
        if search:
            params["SearchTerm"] = search
            params["EnableSearch"] = "true"
        session = await self._get_session()
        try:
            async with session.get(
                f"{url}/Users/{user_id}/Items",
                headers=self._headers(key),
                params=params,
            ) as resp:
                if resp.status != 200:
                    log.error("Jellyfin /Items returned %s", resp.status)
                    return {"items": [], "total": 0}
                data = await resp.json()
                return {
                    "items": data.get("Items", []),
                    "total": data.get("TotalRecordCount", 0),
                }
        except Exception as exc:
            log.error("Jellyfin: get_items failed: %s", exc)
            return {"items": [], "total": 0}

    async def get_all_virtual_folders(self) -> list[dict]:
        """Return all virtual folders via /Library/VirtualFolders (admin, bypasses per-user visibility)."""
        cfg = self._get_config()
        if cfg is None:
            return []
        url, key = cfg
        session = await self._get_session()
        try:
            async with session.get(
                f"{url}/Library/VirtualFolders",
                headers=self._headers(key),
            ) as resp:
                if resp.status != 200:
                    log.error("Jellyfin /Library/VirtualFolders returned %s", resp.status)
                    return []
                data = await resp.json()
                log.info("Jellyfin VirtualFolders: %s", [(i.get("Name"), i.get("CollectionType")) for i in data])
                return data
        except Exception as exc:
            log.error("Jellyfin: get_all_virtual_folders failed: %s", exc)
            return []

    async def get_music_artists(self, library_id: str = "all", search: str = "", limit: int = 200, start_index: int = 0) -> dict:
        """Return music artists using the /Artists/AlbumArtists endpoint."""
        cfg = self._get_config()
        if cfg is None:
            return {"items": [], "total": 0}
        url, key = cfg
        self._invalidate_if_config_changed(url, key)
        user_id = await self._get_user_id(url, key)
        if user_id is None:
            return {"items": [], "total": 0}
        params: dict[str, str] = {
            "UserId": user_id,
            "SortBy": "Name",
            "SortOrder": "Ascending",
            "Recursive": "true",
            "Fields": "ImageTags",
            "Limit": str(limit),
            "StartIndex": str(start_index),
        }
        if library_id != "all":
            params["ParentId"] = library_id
        if search:
            params["SearchTerm"] = search
        session = await self._get_session()
        try:
            async with session.get(
                f"{url}/Artists/AlbumArtists",
                headers=self._headers(key),
                params=params,
            ) as resp:
                if resp.status != 200:
                    log.error("Jellyfin /Artists/AlbumArtists returned %s", resp.status)
                    return {"items": [], "total": 0}
                data = await resp.json()
                log.info("Jellyfin artists result: total=%s items=%s", data.get("TotalRecordCount"), [i.get("Name") for i in data.get("Items", [])[:5]])
                return {
                    "items": data.get("Items", []),
                    "total": data.get("TotalRecordCount", 0),
                }
        except Exception as exc:
            log.error("Jellyfin: get_music_artists failed: %s", exc)
            return {"items": [], "total": 0}

    async def get_albums_by_artist(self, artist_id: str, limit: int = 200, start_index: int = 0) -> dict:
        """Return albums for a given artist using AlbumArtistIds."""
        cfg = self._get_config()
        if cfg is None:
            return {"items": [], "total": 0}
        url, key = cfg
        self._invalidate_if_config_changed(url, key)
        user_id = await self._get_user_id(url, key)
        if user_id is None:
            return {"items": [], "total": 0}
        params: dict[str, str] = {
            "SortBy": "ProductionYear,Name",
            "SortOrder": "Ascending",
            "Recursive": "true",
            "Fields": "Overview,CommunityRating,RunTimeTicks,UserData,ImageTags",
            "IncludeItemTypes": "MusicAlbum",
            "AlbumArtistIds": artist_id,
            "Limit": str(limit),
            "StartIndex": str(start_index),
        }
        session = await self._get_session()
        try:
            async with session.get(
                f"{url}/Users/{user_id}/Items",
                headers=self._headers(key),
                params=params,
            ) as resp:
                if resp.status != 200:
                    log.error("Jellyfin /Items (albums) returned %s", resp.status)
                    return {"items": [], "total": 0}
                data = await resp.json()
                log.info("Jellyfin albums result: status=%s total=%s items=%s", resp.status, data.get("TotalRecordCount"), [i.get("Name") for i in data.get("Items", [])[:5]])
                return {
                    "items": data.get("Items", []),
                    "total": data.get("TotalRecordCount", 0),
                }
        except Exception as exc:
            log.error("Jellyfin: get_albums_by_artist failed: %s", exc)
            return {"items": [], "total": 0}

    async def get_tracks_by_album(self, album_id: str, limit: int = 200, start_index: int = 0) -> dict:
        """Return tracks for a given album using ParentId."""
        cfg = self._get_config()
        if cfg is None:
            return {"items": [], "total": 0}
        url, key = cfg
        self._invalidate_if_config_changed(url, key)
        user_id = await self._get_user_id(url, key)
        if user_id is None:
            return {"items": [], "total": 0}
        params: dict[str, str] = {
            "SortBy": "ParentIndexNumber,IndexNumber,SortName",
            "SortOrder": "Ascending",
            "Fields": "RunTimeTicks,UserData,ImageTags",
            "IncludeItemTypes": "Audio",
            "ParentId": album_id,
            "Limit": str(limit),
            "StartIndex": str(start_index),
        }
        session = await self._get_session()
        try:
            async with session.get(
                f"{url}/Users/{user_id}/Items",
                headers=self._headers(key),
                params=params,
            ) as resp:
                if resp.status != 200:
                    log.error("Jellyfin /Items (tracks) returned %s", resp.status)
                    return {"items": [], "total": 0}
                data = await resp.json()
                return {
                    "items": data.get("Items", []),
                    "total": data.get("TotalRecordCount", 0),
                }
        except Exception as exc:
            log.error("Jellyfin: get_tracks_by_album failed: %s", exc)
            return {"items": [], "total": 0}

    async def get_seasons(self, series_id: str) -> list[dict]:
        """Return all seasons for a series."""
        cfg = self._get_config()
        if cfg is None:
            return []
        url, key = cfg
        self._invalidate_if_config_changed(url, key)
        user_id = await self._get_user_id(url, key)
        if user_id is None:
            return []
        session = await self._get_session()
        try:
            async with session.get(
                f"{url}/Shows/{series_id}/Seasons",
                headers=self._headers(key),
                params={"UserId": user_id, "Fields": "Overview,UserData"},
            ) as resp:
                if resp.status != 200:
                    log.error("Jellyfin /Seasons returned %s", resp.status)
                    return []
                data = await resp.json()
                return sorted(data.get("Items", []), key=lambda s: s.get("IndexNumber") or 0)
        except Exception as exc:
            log.error("Jellyfin: get_seasons failed: %s", exc)
            return []

    async def get_episodes(self, series_id: str, season_id: str) -> list[dict]:
        """Return all episodes for a season."""
        cfg = self._get_config()
        if cfg is None:
            return []
        url, key = cfg
        self._invalidate_if_config_changed(url, key)
        user_id = await self._get_user_id(url, key)
        if user_id is None:
            return []
        session = await self._get_session()
        try:
            async with session.get(
                f"{url}/Shows/{series_id}/Episodes",
                headers=self._headers(key),
                params={
                    "UserId": user_id,
                    "SeasonId": season_id,
                    "Fields": "Overview,RunTimeTicks,UserData",
                },
            ) as resp:
                if resp.status != 200:
                    log.error("Jellyfin /Episodes returned %s", resp.status)
                    return []
                data = await resp.json()
                return sorted(data.get("Items", []), key=lambda e: e.get("IndexNumber") or 0)
        except Exception as exc:
            log.error("Jellyfin: get_episodes failed: %s", exc)
            return []


_client = _JellyfinBackendClient()


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


class JellyfinItemsResponse(BaseModel):
    """Paginated response for Jellyfin items."""
    items: list[JellyfinItemResponse]
    total: int


@router.get("/libraries", response_model=list[JellyfinLibraryResponse])
async def get_jellyfin_libraries_endpoint() -> list[JellyfinLibraryResponse]:
    """Get Jellyfin media libraries."""
    items = await _client.get_libraries()
    return [
        JellyfinLibraryResponse(
            Name=item.get("Name", ""),
            Id=item.get("Id", ""),
            Type=item.get("Type", ""),
            CollectionType=item.get("CollectionType", ""),
        )
        for item in items
    ]


@router.get("/items/{library_id}", response_model=JellyfinItemsResponse)
async def get_jellyfin_items_endpoint(
    library_id: str,
    sort_by: str = "Name",
    sort_order: str = "Ascending",
    search: str = "",
    limit: int = 50,
    start_index: int = 0,
    include_item_types: str = "Movie,Series,Episode,MusicAlbum,MusicArtist,Book",
) -> JellyfinItemsResponse:
    """Get paginated items from a Jellyfin library."""
    result = await _client.get_items(library_id, sort_by, sort_order, search, limit, start_index, include_item_types)
    return JellyfinItemsResponse(
        items=[
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
                UserData=item.get("UserData"),
            )
            for item in result["items"]
        ],
        total=result["total"],
    )


@router.get("/music/libraries", response_model=list[JellyfinLibraryResponse])
async def get_jellyfin_music_libraries() -> list[JellyfinLibraryResponse]:
    """Get only music collection libraries from Jellyfin via VirtualFolders (bypasses per-user visibility)."""
    items = await _client.get_all_virtual_folders()
    log.info("VirtualFolders: %s", [(i.get("Name"), i.get("CollectionType")) for i in items])
    music = [i for i in items if (i.get("CollectionType") or "").lower() == "music"]
    log.info("Filtered music libraries: %s", [i.get("Name") for i in music])
    return [
        JellyfinLibraryResponse(
            Name=item.get("Name", ""),
            Id=item.get("ItemId", item.get("Id", "")),
            Type=item.get("Type", ""),
            CollectionType=item.get("CollectionType", ""),
        )
        for item in music
    ]


@router.get("/music/artists", response_model=JellyfinItemsResponse)
async def get_jellyfin_music_artists(
    library_id: str = "all",
    search: str = "",
    limit: int = 200,
    start_index: int = 0,
) -> JellyfinItemsResponse:
    """Get artists from a Jellyfin music library."""
    result = await _client.get_music_artists(library_id, search, limit, start_index)
    return JellyfinItemsResponse(
        items=[JellyfinItemResponse(**{k: v for k, v in item.items() if k in JellyfinItemResponse.model_fields}) for item in result["items"]],
        total=result["total"],
    )


@router.get("/music/albums", response_model=JellyfinItemsResponse)
async def get_jellyfin_music_albums(
    artist_id: str,
    limit: int = 200,
    start_index: int = 0,
) -> JellyfinItemsResponse:
    """Get albums for a specific artist using AlbumArtistIds."""
    result = await _client.get_albums_by_artist(artist_id, limit, start_index)
    return JellyfinItemsResponse(
        items=[JellyfinItemResponse(**{k: v for k, v in item.items() if k in JellyfinItemResponse.model_fields}) for item in result["items"]],
        total=result["total"],
    )


@router.get("/music/tracks", response_model=JellyfinItemsResponse)
async def get_jellyfin_music_tracks(
    album_id: str,
    limit: int = 200,
    start_index: int = 0,
) -> JellyfinItemsResponse:
    """Get tracks for a specific album using ParentId."""
    result = await _client.get_tracks_by_album(album_id, limit, start_index)
    return JellyfinItemsResponse(
        items=[JellyfinItemResponse(**{k: v for k, v in item.items() if k in JellyfinItemResponse.model_fields}) for item in result["items"]],
        total=result["total"],
    )


@router.post("/by-names", response_model=list[JellyfinItemResponse])
async def get_jellyfin_items_by_names(names: list[str]) -> list[JellyfinItemResponse]:
    """Resolve a list of item names to full Jellyfin item objects (used by dashboard featured section)."""
    results: list[JellyfinItemResponse] = []
    for name in names:
        data = await _client.get_items("all", "Name", "Ascending", name, limit=1, start_index=0)
        for item in data["items"]:
            if item.get("Name", "").lower() == name.lower():
                results.append(JellyfinItemResponse(
                    Id=item.get("Id", ""),
                    Name=item.get("Name", ""),
                    Type=item.get("Type", ""),
                    ProductionYear=item.get("ProductionYear"),
                    PremiereDate=item.get("PremiereDate"),
                    CommunityRating=item.get("CommunityRating"),
                    RunTimeTicks=item.get("RunTimeTicks"),
                    Overview=item.get("Overview"),
                    ImageTags=item.get("ImageTags"),
                    UserData=item.get("UserData"),
                ))
                break
    return results


@router.get("/series/{series_id}/seasons", response_model=list[JellyfinItemResponse])
async def get_jellyfin_seasons_endpoint(series_id: str) -> list[JellyfinItemResponse]:
    """Get all seasons for a TV series."""
    seasons = await _client.get_seasons(series_id)
    return [
        JellyfinItemResponse(
            Id=s.get("Id", ""),
            Name=s.get("Name", ""),
            Type=s.get("Type", "Season"),
            ProductionYear=s.get("ProductionYear"),
            Overview=s.get("Overview"),
            ImageTags=s.get("ImageTags"),
            UserData=s.get("UserData"),
        )
        for s in seasons
    ]


@router.get("/series/{series_id}/seasons/{season_id}/episodes", response_model=list[JellyfinItemResponse])
async def get_jellyfin_episodes_endpoint(series_id: str, season_id: str) -> list[JellyfinItemResponse]:
    """Get all episodes for a season."""
    episodes = await _client.get_episodes(series_id, season_id)
    return [
        JellyfinItemResponse(
            Id=e.get("Id", ""),
            Name=e.get("Name", ""),
            Type=e.get("Type", "Episode"),
            ProductionYear=e.get("ProductionYear"),
            PremiereDate=e.get("PremiereDate"),
            CommunityRating=e.get("CommunityRating"),
            RunTimeTicks=e.get("RunTimeTicks"),
            Overview=e.get("Overview"),
            ImageTags=e.get("ImageTags"),
            UserData=e.get("UserData"),
        )
        for e in episodes
    ]
