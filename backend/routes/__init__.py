"""FastAPI routes package for SlopSoil Web GUI.

This package organizes API routes by domain:
- auth: Authentication (login, JWT, current user)
- users: User management (CRUD)
- config: Settings/configuration
- bot: Bot status and lifecycle
- voice: Voice channel control
- audio: Audio/music player
- iptv: IPTV sources and channels
- bookmarks: Bookmark management
- jellyfin: Jellyfin integration
- soundboard: Soundboard file management and playback
- featured: Featured items per category
"""

from fastapi import APIRouter

from backend.routes.auth import router as auth_router
from backend.routes.users import router as users_router
from backend.routes.config import router as config_router
from backend.routes.bot import router as bot_router
from backend.routes.voice import router as voice_router
from backend.routes.audio import router as audio_router
from backend.routes.music import router as music_router
from backend.routes.iptv import router as iptv_router
from backend.routes.bookmarks import router as bookmarks_router
from backend.routes.jellyfin import router as jellyfin_router
from backend.routes.soundboard import router as soundboard_router
from backend.routes.featured import router as featured_router

# Main router that aggregates all domain routers
router = APIRouter()

# Include all domain routers with their prefixes
router.include_router(auth_router, prefix="/api")
router.include_router(users_router, prefix="/api")
router.include_router(config_router, prefix="/api")
router.include_router(bot_router, prefix="/api")
router.include_router(voice_router, prefix="/api")
router.include_router(audio_router, prefix="/api")
router.include_router(music_router, prefix="/api")
router.include_router(iptv_router, prefix="/api")
router.include_router(bookmarks_router, prefix="/api")
router.include_router(jellyfin_router, prefix="/api")
router.include_router(soundboard_router, prefix="/api")
router.include_router(featured_router, prefix="/api")

__all__ = ["router"]
