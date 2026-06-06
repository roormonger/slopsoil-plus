import { useState, useEffect } from 'react'
import { RefreshCw, Phone, PhoneOff, Terminal, ArrowRightLeft } from 'lucide-react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Dropdown } from './ui/dropdown'
import { useApi } from '../hooks/useApi'
import { useGuild } from '../contexts/GuildContext'
import { useWebSocketContext } from '../context/WebSocketContext'
import type { BotStatus } from '../types'

interface TopNavigationProps {
  onNavigate?: (page: string) => void
}

export default function TopNavigation({ onNavigate }: TopNavigationProps) {
  const api = useApi()
  const { selectedGuild, selectedVoiceChannel, setSelectedGuild, setSelectedVoiceChannel } = useGuild()
  const { botStatus: wsBotStatus, voiceState } = useWebSocketContext()
  const [guilds, setGuilds] = useState<Array<{ id: string; name: string }>>([])
  const [voiceChannels, setVoiceChannels] = useState<Array<{ id: string; name: string }>>([])
  const [commandInput, setCommandInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [initialBotStatus, setInitialBotStatus] = useState<BotStatus | null>(null)

  // Load initial bot status via HTTP (WS only broadcasts on change, so new clients miss initial state)
  useEffect(() => {
    const loadStatus = async () => {
      const status = await api.fetchStatus()
      if (status) setInitialBotStatus(status)
    }
    loadStatus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const botStatus = wsBotStatus || initialBotStatus

  // Load guilds
  useEffect(() => {
    const loadGuilds = async () => {
      try {
        const guildsData = await api.fetchGuilds()
        if (guildsData) {
          setGuilds(guildsData)
          
          // Check if saved guild is still available, otherwise select first guild
          if (selectedGuild) {
            const savedGuildExists = guildsData.some(guild => guild.id === selectedGuild)
            if (!savedGuildExists && guildsData.length > 0) {
              setSelectedGuild(guildsData[0].id)
            }
          } else if (guildsData.length > 0) {
            // No saved guild, select first one
            setSelectedGuild(guildsData[0].id)
          }
        }
      } catch (error) {
        console.error('Failed to load guilds:', error)
      }
    }
    loadGuilds()
  }, [selectedGuild, setSelectedGuild])

  // Load voice channels when guild is selected
  useEffect(() => {
    if (!selectedGuild) return

    const loadVoiceChannels = async () => {
      try {
        const channelsData = await api.fetchVoiceChannels(selectedGuild)
        if (channelsData) {
          setVoiceChannels(channelsData)
          
          // Check if saved voice channel is still available for this guild
          if (selectedVoiceChannel) {
            const savedChannelExists = channelsData.some(channel => channel.id === selectedVoiceChannel)
            if (!savedChannelExists) {
              // Clear saved voice channel if it's no longer available
              setSelectedVoiceChannel('')
            }
          }
        }
      } catch (error) {
        console.error('Failed to load voice channels:', error)
      }
    }
    loadVoiceChannels()
  }, [selectedGuild, selectedVoiceChannel, setSelectedVoiceChannel])

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
        // Check if we need to switch or leave
        const currentGuildId = voiceState.guild_id
        const currentChannelId = voiceState.channel_id
        if (!currentGuildId) return

        if (currentGuildId !== selectedGuild || currentChannelId !== selectedVoiceChannel) {
          // Switch to new server/channel
          await api.leaveVoiceChannel(currentGuildId)
          await api.joinVoiceChannel(selectedGuild, selectedVoiceChannel)
        } else {
          // Leave current channel
          await api.leaveVoiceChannel(selectedGuild)
        }
      } else {
        // Join new channel
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

  const getVoiceButtonText = () => {
    const state = getVoiceButtonState()
    switch (state) {
      case 'join': return 'Join Voice'
      case 'leave': return 'Leave Voice'
      case 'switch': return 'Switch'
      default: return 'Join Voice'
    }
  }

  const getVoiceButtonIcon = () => {
    const state = getVoiceButtonState()
    switch (state) {
      case 'join': return Phone
      case 'leave': return PhoneOff
      case 'switch': return ArrowRightLeft
      default: return Phone
    }
  }

  const getVoiceButtonClass = () => {
    const state = getVoiceButtonState()
    switch (state) {
      case 'join':
        return 'bg-green-500/20 text-green-400 border border-green-500/30 hover:bg-green-500/30'
      case 'leave':
        return 'bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30'
      case 'switch':
        return 'bg-amber-500/20 text-amber-400 border border-amber-500/30 hover:bg-amber-500/30'
      default:
        return 'bg-green-500/20 text-green-400 border border-green-500/30 hover:bg-green-500/30'
    }
  }

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

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleExecuteCommand()
    }
  }

  return (
    <div className="fixed top-0 left-0 right-0 h-20 bg-slate-900/95 backdrop-blur-sm border-b border-white/10 z-50">
      <div className="h-full px-4 flex items-center justify-between">
        {/* Left side - Logo and Title */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => onNavigate?.('dashboard')}
            className="flex items-center gap-2 hover:opacity-80 transition-opacity"
          >
            <img
              src="/logo.png"
              alt="SlopSoil"
              className="w-8 h-8 rounded-lg"
            />
            <h1 className="text-xl font-bold gradient-text">SlopSoil+</h1>
          </button>
        </div>

        {/* Center - Bot Controls */}
        <div className="flex items-center gap-3">
          {/* Bot Status */}
          {botStatus && (
            <div className="flex items-center gap-3">
              <div className="relative">
                <img
                  src={
                    botStatus?.bot?.avatar_url || '/discord-avatar.png'
                  }
                  onError={(e) => {
                    e.currentTarget.src = '/discord-avatar.png'
                  }}
                  alt="Bot Avatar"
                  className="w-10 h-10 rounded-full ring-2 ring-primary/30 shadow-lg"
                />
                <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-slate-800 ${
                  botStatus.running ? 'bg-emerald-400' : 'bg-red-400'
                }`} />
              </div>
              <div>
                <div className="font-semibold text-slate-200 text-base">{botStatus?.bot?.name || 'Bot Name'}</div>
                <div className="text-xs text-slate-400 truncate max-w-32">
                  {botStatus?.status || 'Idle'}
                </div>
              </div>
            </div>
          )}

          {/* Server Dropdown */}
          <Dropdown
            options={guilds.map(guild => ({ value: guild.id, label: guild.name }))}
            value={selectedGuild}
            onChange={setSelectedGuild}
            placeholder="Select Server"
            className="w-48"
          />

          {/* Voice Channel Dropdown */}
          <Dropdown
            options={voiceChannels.map(channel => ({ value: channel.id, label: channel.name }))}
            value={selectedVoiceChannel}
            onChange={setSelectedVoiceChannel}
            placeholder="Select Voice Channel"
            disabled={!selectedGuild}
            className="w-48"
          />

          {/* Join/Leave/Switch Voice Button */}
          <Button
            size="sm"
            onClick={handleJoinLeaveVoice}
            disabled={!selectedGuild || !selectedVoiceChannel}
            className={`h-8 px-3 ${getVoiceButtonClass()} disabled:opacity-50`}
          >
            {(() => {
              const Icon = getVoiceButtonIcon()
              return (
                <>
                  <Icon className="w-3 h-3 mr-1" />
                  {getVoiceButtonText()}
                </>
              )
            })()}
          </Button>

          {/* Reload Bot Button */}
          <Button
            size="sm"
            variant="outline"
            onClick={handleReloadBot}
            disabled={isLoading}
            className="h-8 glass-light border-white/10 text-slate-300 hover:bg-white/10 disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        {/* Right side - Command Input */}
        <div className="flex items-center gap-2">
          <div className="relative">
            <Terminal className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
            <Input
              value={commandInput}
              onChange={(e) => setCommandInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Execute command..."
              className="pl-10 pr-4 h-8 w-64 glass-input text-slate-200 text-sm placeholder:text-slate-500"
              disabled={!selectedGuild}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
