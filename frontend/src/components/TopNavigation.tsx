import { useState, useEffect, useRef } from 'react'
import { RefreshCw, Phone, PhoneOff, ArrowRightLeft, ChevronDown, Music, Tv, Terminal } from 'lucide-react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Dropdown } from './ui/dropdown'
import { useApi } from '../hooks/useApi'
import { useAuth } from '../context/AuthContext'
import { useGuild } from '../contexts/GuildContext'
import { useWebSocketContext } from '../context/WebSocketContext'
import type { BotStatus, Guild, VoiceChannel } from '../types'

interface TopNavigationProps {
  onNavigate?: (page: string) => void
}

function NowPlayingBar() {
  const { nowPlaying, musicStatus } = useWebSocketContext()
  const [elapsed, setElapsed] = useState(0)

  const videoStream = nowPlaying[0] ?? null
  const musicTrack = musicStatus?.is_playing || musicStatus?.is_paused ? musicStatus.current : null

  const activeTitle = videoStream?.title ?? musicTrack?.title ?? null
  const isMusic = !videoStream && !!musicTrack
  const startedAt = videoStream?.started_at ?? null
  const duration = musicTrack?.duration ?? 0

  useEffect(() => {
    if (!startedAt && !isMusic) {
      setElapsed(0)
      return
    }
    const tick = () => {
      if (startedAt) {
        setElapsed(Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000))
      } else if (isMusic) {
        setElapsed(prev => prev + 1)
      }
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [startedAt, isMusic])

  useEffect(() => {
    if (isMusic) setElapsed(0)
  }, [musicTrack?.url])

  if (!activeTitle) return null

  const fmt = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  const progress = duration > 0 ? Math.min((elapsed / duration) * 100, 100) : null

  return (
    <div className="flex items-center gap-3 max-w-sm">
      <div className={`p-1.5 rounded-lg shrink-0 ${isMusic ? 'bg-violet-500/20 text-violet-400' : 'bg-blue-500/20 text-blue-400'}`}>
        {isMusic ? <Music className="w-3.5 h-3.5" /> : <Tv className="w-3.5 h-3.5" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-slate-200 truncate leading-tight">{activeTitle}</p>
        <div className="flex items-center gap-2 mt-0.5">
          {progress !== null ? (
            <>
              <div className="flex-1 h-0.5 bg-slate-700 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-1000 ${isMusic ? 'bg-violet-400' : 'bg-blue-400'}`}
                  style={{ width: `${progress}%` }}
                />
              </div>
              <span className="text-[10px] text-slate-500 shrink-0">{fmt(elapsed)} / {fmt(duration)}</span>
            </>
          ) : (
            <>
              <div className="flex-1 h-0.5 bg-slate-700 rounded-full overflow-hidden">
                <div className="h-full w-full bg-blue-400/40 animate-pulse rounded-full" />
              </div>
              <span className="text-[10px] text-slate-500 shrink-0">{fmt(elapsed)}</span>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default function TopNavigation({ onNavigate }: TopNavigationProps) {
  const api = useApi()
  const { user } = useAuth()
  const { selectedGuild, selectedVoiceChannel, setSelectedGuild, setSelectedVoiceChannel } = useGuild()
  const { botStatus: wsBotStatus, voiceState, guilds: wsGuilds } = useWebSocketContext()
  const [commandInput, setCommandInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [initialBotStatus, setInitialBotStatus] = useState<BotStatus | null>(null)
  const [httpGuilds, setHttpGuilds] = useState<Guild[]>([])
  const [httpVoiceChannels, setHttpVoiceChannels] = useState<VoiceChannel[]>([])
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // One-time HTTP fetch for guilds (fallback while WS connects)
  useEffect(() => {
    api.fetchGuilds().then(data => {
      if (data) {
        console.log('[TopNav] HTTP guilds loaded:', data.length)
        setHttpGuilds(data)
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // One-time HTTP fetch for voice channels (fallback while WS connects)
  useEffect(() => {
    if (!selectedGuild) return
    api.fetchVoiceChannels(selectedGuild).then(data => {
      if (data) {
        console.log('[TopNav] HTTP voice channels loaded:', data.length)
        setHttpVoiceChannels(data)
      }
    })
  }, [selectedGuild])

  // Load initial bot status via HTTP (WS only broadcasts on change, so new clients miss initial state)
  useEffect(() => {
    const loadStatus = async () => {
      const status = await api.fetchStatus()
      if (status) setInitialBotStatus(status)
    }
    loadStatus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const botStatus = wsBotStatus || initialBotStatus

  // Prefer WS guilds, fall back to HTTP
  const effectiveGuilds = wsGuilds.length > 0 ? wsGuilds : httpGuilds

  // Auto-select guild when guilds arrive or saved guild becomes invalid
  useEffect(() => {
    if (effectiveGuilds.length === 0) return
    if (selectedGuild) {
      const savedGuildExists = effectiveGuilds.some(guild => guild.id === selectedGuild)
      if (!savedGuildExists) {
        setSelectedGuild(effectiveGuilds[0].id)
      }
    } else {
      setSelectedGuild(effectiveGuilds[0].id)
    }
  }, [effectiveGuilds, selectedGuild, setSelectedGuild])

  // Derive voice channels for the selected guild (prefer WS, fallback to HTTP)
  const wsVoiceChannels = wsGuilds.find(g => g.id === selectedGuild)?.voice_channels
  const voiceChannels = wsVoiceChannels && wsVoiceChannels.length > 0
    ? wsVoiceChannels
    : httpVoiceChannels

  // Validate saved voice channel when guild or channels change
  useEffect(() => {
    if (!selectedGuild) return
    if (selectedVoiceChannel && !voiceChannels.some(c => c.id === selectedVoiceChannel)) {
      setSelectedVoiceChannel('')
    }
  }, [selectedGuild, voiceChannels, selectedVoiceChannel, setSelectedVoiceChannel])

  // Track last auto-selected voice state to avoid overwriting manual selections
  const lastAutoSelectedRef = useRef<{ guild_id?: string; channel_id?: string }>({})

  // Auto-select guild and voice channel when bot connects via Discord
  // Only triggers when voice state values actually change, not on every WS broadcast
  useEffect(() => {
    if (!voiceState?.connected) {
      lastAutoSelectedRef.current = {}
      return
    }
    const { guild_id, channel_id } = voiceState
    if (!guild_id || !channel_id) return

    // Only auto-select if voice state has actually changed since last auto-select
    const last = lastAutoSelectedRef.current
    if (last.guild_id === guild_id && last.channel_id === channel_id) {
      return // Voice state hasn't changed, don't overwrite manual selection
    }

    // Update guild selection if different
    if (guild_id !== selectedGuild) {
      console.log('[TopNav] Auto-selecting guild from voiceState:', guild_id)
      setSelectedGuild(guild_id)
    }

    // Update voice channel selection if different (and channels are loaded)
    if (channel_id !== selectedVoiceChannel && voiceChannels.some(c => c.id === channel_id)) {
      console.log('[TopNav] Auto-selecting voice channel from voiceState:', channel_id)
      setSelectedVoiceChannel(channel_id)
    }

    // Remember what we auto-selected so we don't overwrite manual changes
    lastAutoSelectedRef.current = { guild_id, channel_id }
  }, [voiceState, selectedGuild, setSelectedGuild, selectedVoiceChannel, setSelectedVoiceChannel, voiceChannels])

  const handleReloadBot = async () => {
    setIsLoading(true)
    try {
      await api.reloadBot()
    } catch (error) {
      console.error('Failed to reload bot:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleJoinLeaveVoice = async () => {
    if (!selectedGuild || !selectedVoiceChannel) return

    try {
      if (voiceState?.connected) {
        const currentGuildId = voiceState.guild_id
        const currentChannelId = voiceState.channel_id
        if (!currentGuildId) return

        if (currentGuildId !== selectedGuild || currentChannelId !== selectedVoiceChannel) {
          await api.leaveVoiceChannel(currentGuildId)
          await api.joinVoiceChannel(selectedGuild, selectedVoiceChannel)
        } else {
          await api.leaveVoiceChannel(selectedGuild)
        }
      } else {
        await api.joinVoiceChannel(selectedGuild, selectedVoiceChannel)
      }
    } catch (error) {
      console.error('Failed to join/leave/switch voice channel:', error)
    }
  }

  const getVoiceButtonState = () => {
    if (!voiceState?.connected) return 'join'
    if (voiceState?.guild_id !== selectedGuild || voiceState?.channel_id !== selectedVoiceChannel) return 'switch'
    return 'leave'
  }

  const voiceBtnState = getVoiceButtonState()
  const voiceBtnConfig = {
    join:   { label: 'Join',   Icon: Phone,          cls: 'bg-green-500/20 text-green-400 border-green-500/30 hover:bg-green-500/30' },
    leave:  { label: 'Leave',  Icon: PhoneOff,        cls: 'bg-red-500/20 text-red-400 border-red-500/30 hover:bg-red-500/30' },
    switch: { label: 'Switch', Icon: ArrowRightLeft,  cls: 'bg-amber-500/20 text-amber-400 border-amber-500/30 hover:bg-amber-500/30' },
  }[voiceBtnState]

  const handleExecuteCommand = async () => {
    if (!selectedGuild || !commandInput.trim()) return
    try {
      const [command, ...args] = commandInput.trim().split(' ')
      await api.executeCommand(selectedGuild, command, args.join(' '), selectedVoiceChannel)
      setCommandInput('')
    } catch (error) {
      console.error('Failed to execute command:', error)
    }
  }

  const currentGuildName = effectiveGuilds.find(g => g.id === selectedGuild)?.name
  const currentChannelName = voiceChannels.find(c => c.id === selectedVoiceChannel)?.name

  return (
    <div className="fixed top-0 left-0 right-0 h-16 bg-slate-900/95 backdrop-blur-sm border-b border-white/10 z-50">
      <div className="h-full px-4 flex items-center justify-between gap-4">

        {/* Left — Logo */}
        <button
          onClick={() => onNavigate?.('dashboard')}
          className="flex items-center gap-2 hover:opacity-80 transition-opacity shrink-0"
        >
          <img src="/logo.png" alt="SlopSoil" className="w-7 h-7 rounded-lg" />
          <h1 className="text-lg font-bold gradient-text">SlopSoil+</h1>
        </button>

        {/* Center — Now Playing */}
        <div className="flex-1 flex justify-center">
          <NowPlayingBar />
        </div>

        {/* Right — Bot account widget */}
        <div className="relative shrink-0" ref={dropdownRef}>
          <button
            onClick={() => setDropdownOpen(v => !v)}
            className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl glass-light border border-white/10 hover:bg-white/10 transition-all"
          >
            {/* Avatar + status dot */}
            <div className="relative">
              <img
                src={botStatus?.bot?.avatar_url || '/discord-avatar.png'}
                onError={(e) => { e.currentTarget.src = '/discord-avatar.png' }}
                alt="Bot"
                className="w-8 h-8 rounded-full ring-1 ring-primary/30"
              />
              <div className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-slate-900 ${
                botStatus?.running ? 'bg-emerald-400' : 'bg-red-400'
              }`} />
            </div>

            {/* Name + voice context */}
            <div className="text-left leading-tight hidden sm:block">
              <p className="text-sm font-semibold text-slate-200">{botStatus?.bot?.name ?? 'Bot'}</p>
              <p className="text-[11px] text-slate-400 truncate max-w-[140px]">
                {voiceState?.connected
                  ? `${voiceState.guild_name ?? currentGuildName} · ${voiceState.channel_name ?? currentChannelName}`
                  : (currentGuildName ?? 'No server selected')}
              </p>
            </div>

            <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${dropdownOpen ? 'rotate-180' : ''}`} />
          </button>

          {/* Dropdown panel */}
          {dropdownOpen && (
            <div className="absolute right-0 top-full mt-2 w-72 glass-card border border-white/10 rounded-2xl shadow-2xl p-4 space-y-3 z-50">

              {/* Server selector */}
              <div className="space-y-1">
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Server</p>
                <Dropdown
                  options={effectiveGuilds.map(g => ({ value: g.id, label: g.name }))}
                  value={selectedGuild}
                  onChange={setSelectedGuild}
                  placeholder="Select Server"
                  className="w-full"
                />
              </div>

              {/* Voice channel selector */}
              <div className="space-y-1">
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Voice Channel</p>
                <Dropdown
                  options={voiceChannels.map(c => ({ value: c.id, label: c.name }))}
                  value={selectedVoiceChannel}
                  onChange={setSelectedVoiceChannel}
                  placeholder="Select Channel"
                  disabled={!selectedGuild}
                  className="w-full"
                />
              </div>

              {/* Join / Leave / Switch */}
              <Button
                size="sm"
                onClick={handleJoinLeaveVoice}
                disabled={!selectedGuild || !selectedVoiceChannel}
                className={`w-full h-8 border ${voiceBtnConfig.cls} disabled:opacity-50`}
              >
                <voiceBtnConfig.Icon className="w-3.5 h-3.5 mr-1.5" />
                {voiceBtnConfig.label} Voice
              </Button>

              {/* Admin-only section */}
              {user?.role === 'admin' && (
                <>
                  <div className="border-t border-white/5 pt-3 space-y-2">
                    {/* Execute command */}
                    <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Execute Command</p>
                    <div className="relative">
                      <Terminal className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
                      <Input
                        value={commandInput}
                        onChange={(e) => setCommandInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleExecuteCommand()}
                        placeholder="e.g. audio lofi radio"
                        className="pl-8 h-8 glass-input text-slate-200 text-sm placeholder:text-slate-500 w-full"
                        disabled={!selectedGuild}
                      />
                    </div>

                    {/* Reload bot */}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleReloadBot}
                      disabled={isLoading}
                      className="w-full h-8 glass-light border-white/10 text-slate-300 hover:bg-white/10 disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3 h-3 mr-1.5 ${isLoading ? 'animate-spin' : ''}`} />
                      Reload Bot
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
