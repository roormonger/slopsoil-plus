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
    try:
        # Discord API endpoint to get current user (bot)
        url = "https://discord.com/api/v10/users/@me"
        headers = {
            "Authorization": f"Bot {token}",
            "Content-Type": "application/json"
        }
        
        async with aiohttp.ClientSession() as session:
            async with session.get(url, headers=headers) as response:
                if response.status == 200:
                    data = await response.json()
                    user_id = data.get("id")
                    avatar_hash = data.get("avatar")
                    
                    if user_id and avatar_hash:
                        # Construct avatar URL
                        # Format: https://cdn.discordapp.com/avatars/{user_id}/{avatar_hash}.png
                        avatar_url = f"https://cdn.discordapp.com/avatars/{user_id}/{avatar_hash}.png"
                        log.info(f"Fetched Discord avatar for bot: {avatar_url}")
                        return avatar_url
                    else:
                        log.warning("Discord user has no custom avatar")
                        return None
                else:
                    log.error(f"Failed to fetch Discord user: {response.status}")
                    return None
    except Exception as e:
        log.error(f"Error fetching Discord avatar: {e}")
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
            return {"success": False, "error": "Bot not connected"}
        
        # Fetch user from Discord
        user = await bot.fetch_user(int(user_id))
        if user is None:
            return {"success": False, "error": "User not found"}
        
        return {
            "success": True,
            "id": str(user.id),
            "name": user.name,
            "discriminator": user.discriminator,
            "avatar_url": str(user.avatar.url) if user.avatar else None,
            "bot": user.bot,
        }
    except Exception as e:
        log.error(f"Error fetching Discord user {user_id}: {e}")
        return {"success": False, "error": str(e)}
