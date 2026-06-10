"""Discord API service for SlopSoil.

Handles Discord API calls for fetching user information and avatars.
"""

import logging
from typing import Any

import aiohttp

log = logging.getLogger(__name__)


async def fetch_discord_avatar(token: str) -> str | None:
    """Fetch Discord avatar URL from token.
    
    Args:
        token: Discord bot token
        
    Returns:
        Avatar URL string or None if not available
    """
    info = await fetch_discord_user_info(token)
    return info.get("avatar_url") if info else None


async def fetch_discord_user_info(token: str) -> dict[str, Any] | None:
    """Fetch Discord user @me info: avatar URL and Nitro premium_type.

    Args:
        token: Discord bot token (with or without 'Bot ' prefix)

    Returns:
        Dict with avatar_url (str|None) and premium_type (int 0-3), or None on error.
        premium_type: 0=None, 1=Nitro Classic, 2=Nitro, 3=Nitro Basic
    """
    try:
        url = "https://discord.com/api/v10/users/@me"
        headers = {"Authorization": f"Bot {token}"}

        async with aiohttp.ClientSession() as session:
            async with session.get(url, headers=headers) as response:
                if response.status == 200:
                    data = await response.json()
                    user_id = data.get("id")
                    avatar_hash = data.get("avatar")
                    premium_type = data.get("premium_type", 0) or 0

                    avatar_url = None
                    if user_id and avatar_hash:
                        avatar_url = f"https://cdn.discordapp.com/avatars/{user_id}/{avatar_hash}.png"
                        log.info("Fetched Discord user info: avatar=%s premium_type=%s", avatar_url, premium_type)
                    else:
                        log.warning("Discord user has no custom avatar")

                    return {"avatar_url": avatar_url, "premium_type": premium_type}
                else:
                    log.error("Failed to fetch Discord user: %s", response.status)
                    return None
    except Exception as e:
        log.error("Error fetching Discord user info: %s", e)
        return None


async def fetch_discord_user(user_id: str) -> dict[str, Any]:
    """Fetch Discord user information by ID.
    
    Args:
        user_id: Discord user ID (numeric string)
        
    Returns:
        Dictionary with user information or error details
    """
    from backend.bot_runner import get_bot_instance
    
    try:
        bot = get_bot_instance()
        if bot is None:
            return {"found": False, "error": "Bot not connected"}
        
        # Fetch user from Discord
        user = await bot.fetch_user(int(user_id))
        if user is None:
            return {"found": False, "error": "User not found"}
        
        return {
            "found": True,
            "id": str(user.id),
            "username": user.name,
            "avatar_url": str(user.avatar.url) if user.avatar else None,
        }
    except Exception as e:
        log.error(f"Error fetching Discord user {user_id}: {e}")
        return {"found": False, "error": str(e)}
