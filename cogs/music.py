"""
Music playback cog for Discord voice channels.

Uses yt-dlp to extract audio URLs from YouTube and plays them via
standard discord.py voice client (FFmpegPCMAudio), independent of
the video streaming/screenshare system.

Commands:
  !music <url>        - Play or queue a YouTube URL
  !music search <q>   - Search YouTube and play first result
  !music stop         - Stop playback and clear queue
  !music skip         - Skip to next track
  !music back         - Go back to previous track
  !music queue        - Show current queue
  !music pause        - Pause playback
  !music resume       - Resume playback
  !music volume <0-100> - Set volume
  !music now          - Show currently playing
"""

from __future__ import annotations

import asyncio
import dataclasses
import logging
import re
from typing import TYPE_CHECKING, cast

import discord
from discord.ext import commands

from cogs.utils import resolve_voice
from permissions import Role, require_role

if TYPE_CHECKING:
    from bot import SlopSoil

log = logging.getLogger(__name__)


@dataclasses.dataclass
class MusicTrack:
    """Represents a track in the music queue."""

    url: str  # Direct audio URL (from yt-dlp)
    title: str
    duration: int  # seconds
    thumbnail: str
    requested_by: str  # username
    webpage_url: str  # Original YouTube URL


# yt-dlp options for audio extraction
_YDL_OPTS = {
    "format": "bestaudio[ext=webm]/bestaudio[ext=m4a]/bestaudio",
    "quiet": True,
    "no_warnings": True,
    "extract_flat": False,
}

# FFmpeg options for audio playback
_FFMPEG_BEFORE_OPTS = (
    "-reconnect 1 -reconnect_streamed 1 -reconnect_delay_max 5 " "-fflags +nobuffer"
)
_FFMPEG_OPTS = "-vn -ar 48000 -ac 2"  # No video, 48kHz, stereo


async def _extract_track_info(url: str, requester: str) -> MusicTrack | None:
    """Extract track info from a YouTube URL using yt-dlp."""
    import yt_dlp

    def _run() -> dict | None:
        try:
            with yt_dlp.YoutubeDL(_YDL_OPTS) as ydl:
                info = ydl.extract_info(url, download=False)
                return info
        except Exception as e:
            log.warning("yt-dlp extract failed for %s: %s", url, e)
            return None

    loop = asyncio.get_event_loop()
    info = await loop.run_in_executor(None, _run)

    if not info:
        return None

    # Get the best audio format URL
    formats = info.get("formats", [])
    audio_formats = [f for f in formats if f.get("acodec") != "none" and f.get("vcodec") == "none"]

    if not audio_formats:
        # Fallback to any format with audio
        audio_formats = [f for f in formats if f.get("acodec") != "none"]

    if not audio_formats:
        log.warning("No audio format found for %s", url)
        return None

    # Prefer webm/m4a, fallback to best available
    best_audio = None
    for fmt in audio_formats:
        if fmt.get("ext") in ("webm", "m4a"):
            best_audio = fmt
            break
    if not best_audio:
        best_audio = audio_formats[0]

    return MusicTrack(
        url=best_audio.get("url"),
        title=info.get("title", "Unknown"),
        duration=info.get("duration", 0) or 0,
        thumbnail=info.get("thumbnail", ""),
        requested_by=requester,
        webpage_url=info.get("webpage_url", url),
    )


async def _search_youtube(query: str, requester: str) -> MusicTrack | None:
    """Search YouTube and return the first result as a MusicTrack."""
    import yt_dlp

    # yt-dlp search prefix
    search_url = f"ytsearch1:{query}"

    def _run() -> dict | None:
        try:
            with yt_dlp.YoutubeDL(_YDL_OPTS) as ydl:
                info = ydl.extract_info(search_url, download=False)
                return info
        except Exception as e:
            log.warning("yt-dlp search failed for '%s': %s", query, e)
            return None

    loop = asyncio.get_event_loop()
    info = await loop.run_in_executor(None, _run)

    if not info:
        return None

    # yt-dlp search returns entries list
    entries = info.get("entries", [])
    if not entries:
        return None

    first = entries[0]
    return await _extract_track_info(first.get("url", first.get("webpage_url", "")), requester)


class Music(commands.Cog):
    """Music playback commands."""

    def __init__(self, bot: commands.Bot):
        self.bot = cast("SlopSoil", bot)

    def _get_queue(self, guild_id: int) -> list[MusicTrack]:
        """Get or create queue for a guild."""
        if guild_id not in self.bot.music_queues:
            self.bot.music_queues[guild_id] = []
        return self.bot.music_queues[guild_id]

    def _get_history(self, guild_id: int) -> list[MusicTrack]:
        """Get or create history for a guild."""
        if guild_id not in self.bot.music_history:
            self.bot.music_history[guild_id] = []
        return self.bot.music_history[guild_id]

    def _get_volume(self, guild_id: int) -> float:
        """Get volume for a guild (0.0 - 1.0)."""
        return self.bot.music_volumes.get(guild_id, 1.0)

    def _set_volume(self, guild_id: int, volume: float) -> None:
        """Set volume for a guild (0.0 - 1.0)."""
        self.bot.music_volumes[guild_id] = max(0.0, min(2.0, volume))

    async def _play_track(self, guild_id: int, voice_client: discord.VoiceClient, track: MusicTrack):
        """Start playing a track in the voice channel."""
        volume = self._get_volume(guild_id)

        def _after(error: Exception | None):
            if error:
                log.error("Music playback error: %s", error)
            # Schedule next track check
            asyncio.run_coroutine_threadsafe(
                self._on_track_end(guild_id), self.bot.loop
            )

        # Create FFmpeg audio source
        audio = discord.FFmpegPCMAudio(
            track.url,
            before_options=_FFMPEG_BEFORE_OPTS,
            options=_FFMPEG_OPTS,
        )
        source = discord.PCMVolumeTransformer(audio, volume=volume)

        # Store current track
        self.bot.music_current[guild_id] = track

        # Start playback
        voice_client.play(source, after=_after)
        log.info("Started playing: %s in guild %s", track.title, guild_id)

    async def _on_track_end(self, guild_id: int):
        """Called when a track finishes playing."""
        # Move current to history
        current = self.bot.music_current.pop(guild_id, None)
        if current:
            history = self._get_history(guild_id)
            history.append(current)
            # Cap history at 50
            if len(history) > 50:
                history.pop(0)

        # Check for next track in queue
        queue = self._get_queue(guild_id)
        vc = self.bot.get_guild(guild_id).voice_client if self.bot.get_guild(guild_id) else None

        if queue and vc and vc.is_connected():
            next_track = queue.pop(0)
            await self._play_track(guild_id, vc, next_track)
        else:
            log.info("Music queue empty or voice disconnected in guild %s", guild_id)

    @require_role(Role.FRIEND)
    @commands.group(name="music", invoke_without_command=True)
    async def music(self, ctx: commands.Context, *, query: str = None):
        """Play music from a URL or add to queue. Usage: !music <url> or !music search <query>"""
        if not query:
            await ctx.send("Usage: `!music <youtube_url>` or `!music search <query>`")
            return

        guild, voice_channel, vc = await resolve_voice(ctx)
        if not voice_channel:
            await ctx.send("You need to be in a voice channel!")
            return

        # Ensure voice connection
        if not vc:
            vc = await voice_channel.connect(self_deaf=True)
        elif vc.channel != voice_channel:
            await vc.move_to(voice_channel)

        # Determine if it's a URL or search term
        url_pattern = re.compile(r"https?://\S+")
        is_url = url_pattern.match(query.strip())

        await ctx.send("🎵 Searching..." if not is_url else "🎵 Loading...")

        if is_url:
            track = await _extract_track_info(query.strip(), str(ctx.author))
        else:
            track = await _search_youtube(query, str(ctx.author))

        if not track:
            await ctx.send("❌ Could not find or load that track.")
            return

        # Add to queue or play immediately
        if vc.is_playing() and guild.id in self.bot.music_current:
            # Something is playing, add to queue
            queue = self._get_queue(guild.id)
            queue.append(track)
            await ctx.send(f"✅ Added to queue: **{track.title}** ({_format_duration(track.duration)})")
        else:
            # Play immediately
            await self._play_track(guild.id, vc, track)
            await ctx.send(f"▶️ Now playing: **{track.title}** ({_format_duration(track.duration)})")

    @require_role(Role.FRIEND)
    @music.command(name="search")
    async def music_search(self, ctx: commands.Context, *, query: str):
        """Search YouTube and play the first result."""
        # Delegate to main music command
        await self.music(ctx, query=query)

    @require_role(Role.FRIEND)
    @music.command(name="stop")
    async def music_stop(self, ctx: commands.Context):
        """Stop music playback and clear the queue."""
        guild = ctx.guild
        if not guild:
            return

        vc = guild.voice_client
        if vc and vc.is_playing() and guild.id in self.bot.music_current:
            vc.stop()

        # Clear queue and current
        self.bot.music_queues.pop(guild.id, None)
        self.bot.music_current.pop(guild.id, None)

        await ctx.send("⏹️ Music stopped and queue cleared.")

    @require_role(Role.FRIEND)
    @music.command(name="skip")
    async def music_skip(self, ctx: commands.Context):
        """Skip to the next track in the queue."""
        guild = ctx.guild
        if not guild:
            return

        vc = guild.voice_client
        if not vc or not vc.is_playing():
            await ctx.send("Nothing is playing.")
            return

        queue = self._get_queue(guild.id)
        if not queue:
            await ctx.send("⏭️ Skipping... (no more tracks in queue)")
        else:
            await ctx.send(f"⏭️ Skipping... ({len(queue)} tracks in queue)")

        vc.stop()  # This triggers _on_track_end which plays next

    @require_role(Role.FRIEND)
    @music.command(name="back")
    async def music_back(self, ctx: commands.Context):
        """Go back to the previously played track."""
        guild = ctx.guild
        if not guild:
            return

        history = self._get_history(guild.id)
        if not history:
            await ctx.send("No previous tracks in history.")
            return

        # Get last played track
        previous = history.pop()

        # Prepend to queue
        queue = self._get_queue(guild.id)
        queue.insert(0, previous)

        # Skip to it
        vc = guild.voice_client
        if vc and vc.is_playing():
            await ctx.send(f"⏮️ Going back to: **{previous.title}**")
            vc.stop()
        else:
            await ctx.send(f"⏮️ Queued previous: **{previous.title}**")

    @require_role(Role.FRIEND)
    @music.command(name="queue")
    async def music_queue(self, ctx: commands.Context):
        """Show the current music queue."""
        guild = ctx.guild
        if not guild:
            return

        current = self.bot.music_current.get(guild.id)
        queue = self._get_queue(guild.id)

        if not current and not queue:
            await ctx.send("📭 Queue is empty. Use `!music <url>` to add tracks.")
            return

        lines = ["🎵 **Music Queue**"]

        if current:
            lines.append(f"▶️ **Now Playing:** {current.title} ({_format_duration(current.duration)})")

        if queue:
            lines.append(f"\n**Up Next ({len(queue)} tracks):**")
            for i, track in enumerate(queue[:10], 1):  # Show first 10
                lines.append(f"{i}. {track.title} ({_format_duration(track.duration)})")
            if len(queue) > 10:
                lines.append(f"... and {len(queue) - 10} more")
        else:
            lines.append("\nNo tracks in queue.")

        await ctx.send("\n".join(lines))

    @require_role(Role.FRIEND)
    @music.command(name="pause")
    async def music_pause(self, ctx: commands.Context):
        """Pause the current playback."""
        guild = ctx.guild
        if not guild:
            return

        vc = guild.voice_client
        if vc and vc.is_playing():
            vc.pause()
            await ctx.send("⏸️ Paused.")
        else:
            await ctx.send("Nothing is playing.")

    @require_role(Role.FRIEND)
    @music.command(name="resume")
    async def music_resume(self, ctx: commands.Context):
        """Resume paused playback."""
        guild = ctx.guild
        if not guild:
            return

        vc = guild.voice_client
        if vc and vc.is_paused():
            vc.resume()
            await ctx.send("▶️ Resumed.")
        else:
            await ctx.send("Nothing is paused.")

    @require_role(Role.FRIEND)
    @music.command(name="volume")
    async def music_volume(self, ctx: commands.Context, volume: int):
        """Set the music volume (0-100)."""
        if volume < 0 or volume > 100:
            await ctx.send("Volume must be between 0 and 100.")
            return

        guild = ctx.guild
        if not guild:
            return

        # Convert to 0.0-1.0 range
        vol_float = volume / 100.0
        self._set_volume(guild.id, vol_float)

        # Update current playback if active
        vc = guild.voice_client
        if vc and vc.source and isinstance(vc.source, discord.PCMVolumeTransformer):
            vc.source.volume = vol_float

        await ctx.send(f"🔊 Volume set to {volume}%.")

    @require_role(Role.FRIEND)
    @music.command(name="now")
    async def music_now(self, ctx: commands.Context):
        """Show what's currently playing."""
        guild = ctx.guild
        if not guild:
            return

        current = self.bot.music_current.get(guild.id)
        if not current:
            await ctx.send("Nothing is playing right now.")
            return

        await ctx.send(
            f"🎵 **Now Playing:**\n"
            f"**{current.title}**\n"
            f"Duration: {_format_duration(current.duration)}\n"
            f"Requested by: {current.requested_by}\n"
            f"<{current.webpage_url}>"
        )


def _format_duration(seconds: int) -> str:
    """Format seconds as MM:SS or HH:MM:SS."""
    if seconds <= 0:
        return "?:??"

    hours = seconds // 3600
    minutes = (seconds % 3600) // 60
    secs = seconds % 60

    if hours > 0:
        return f"{hours}:{minutes:02d}:{secs:02d}"
    return f"{minutes}:{secs:02d}"


async def setup(bot: commands.Bot):
    await bot.add_cog(Music(bot))
