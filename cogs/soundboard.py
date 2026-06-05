"""Discord soundboard cog for SlopSoil.

Allows users to play system soundboard clips in voice channels via chat commands.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import TYPE_CHECKING, cast

import discord
from discord.ext import commands

from cogs.utils import resolve_voice
from permissions import Role, require_role

if TYPE_CHECKING:
    from bot import SlopSoil

log = logging.getLogger(__name__)

SOUNDBOARD_DIR = Path("/app/soundboard")
SYSTEM_DIR = SOUNDBOARD_DIR / "system"
_ALLOWED_EXTS = {"mp3", "wav", "ogg", "flac", "m4a", "webm", "opus"}


def _list_system_sounds() -> list[Path]:
    """Return paths to all system sound files."""
    if not SYSTEM_DIR.exists():
        return []
    return [
        p for p in SYSTEM_DIR.iterdir()
        if p.is_file() and p.suffix.lstrip(".").lower() in _ALLOWED_EXTS
    ]


class Soundboard(commands.Cog):
    """Soundboard playback commands."""

    def __init__(self, bot: commands.Bot):
        self.bot = cast("SlopSoil", bot)

    @require_role(Role.FRIEND)
    @commands.group(name="sb", invoke_without_command=True)
    async def soundboard(self, ctx: commands.Context, name: str | None = None):
        """Play a system soundboard clip. Usage: !sb <name> or !sb list"""
        if not name:
            await ctx.send("Usage: `!sb <name>` or `!sb list`")
            return

        # Resolve voice
        guild, voice_channel, vc = await resolve_voice(ctx)
        if not voice_channel:
            await ctx.send("You need to be in a voice channel!")
            return

        if not vc:
            vc = await voice_channel.connect(self_deaf=True)
        elif vc.channel != voice_channel:
            await vc.move_to(voice_channel)

        # Find sound file
        sounds = _list_system_sounds()
        matches = [s for s in sounds if s.stem.lower() == name.lower()]
        if not matches:
            # Try partial match
            matches = [s for s in sounds if name.lower() in s.stem.lower()]
        if not matches:
            available = ", ".join(s.stem for s in sounds[:20]) or "(none)"
            await ctx.send(f"Sound '{name}' not found. Available: {available}")
            return

        filepath = matches[0]

        # Stop any current playback
        if vc.is_playing():
            vc.stop()

        # Cancel any active stream
        from cogs.stream import cancel_stream
        cancel_stream(self.bot, guild.id)

        # Play the sound
        audio = discord.FFmpegPCMAudio(str(filepath))
        source = discord.PCMVolumeTransformer(audio, volume=1.0)

        def _after(error: Exception | None):
            if error:
                log.error("Soundboard playback error: %s", error)

        vc.play(source, after=_after)
        await ctx.send(f"🔊 Playing: **{filepath.stem}**")

    @require_role(Role.FRIEND)
    @soundboard.command(name="list")
    async def soundboard_list(self, ctx: commands.Context):
        """List all available system sounds."""
        sounds = _list_system_sounds()
        if not sounds:
            await ctx.send("No system sounds available.")
            return

        names = [s.stem for s in sounds]
        await ctx.send(f"🔊 **Available sounds:** {', '.join(names)}")


async def setup(bot: commands.Bot):
    """Add the Soundboard cog to the bot."""
    await bot.add_cog(Soundboard(bot))
