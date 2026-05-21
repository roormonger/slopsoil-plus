from __future__ import annotations

from typing import cast

import discord
from discord.ext import commands


async def resolve_voice(
    ctx: commands.Context,
) -> tuple[
    discord.Guild | None,
    discord.VoiceChannel | discord.StageChannel | None,
    discord.VoiceClient | None,
]:
    """
    Return (guild, author_voice_channel, bot_voice_client) for guild and DM contexts.

    Voice state is read directly from guild._voice_states rather than going through
    the Member object. The member cache is populated from GUILD_CREATE's members
    array (often incomplete for large guilds), but _voice_states is always populated
    from GUILD_CREATE's voice_states array, so users already in voice when the bot
    starts are reliably found this way.
    """
    if ctx.guild:
        guild = ctx.guild
        voice_state = guild._voice_states.get(ctx.author.id)
    else:
        guild = None
        voice_state = None
        for g in ctx.bot.guilds:
            vs = g._voice_states.get(ctx.author.id)
            if vs:
                guild = g
                voice_state = vs
                break

    if guild is None:
        return None, None, None

    raw_channel = voice_state.channel if voice_state else None
    voice_channel = cast(
        discord.VoiceChannel | discord.StageChannel | None, raw_channel
    )
    voice_client = cast(discord.VoiceClient | None, guild.voice_client)
    return guild, voice_channel, voice_client
