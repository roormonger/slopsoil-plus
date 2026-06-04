import { useState, useCallback } from 'react'
import type { Config, User, BotStatus, NowPlaying, IptvSource, Bookmark, Guild, VoiceChannel, VoiceStatus, CommandResult, MusicStatus, CommandStats } from '../types'

const API_URL = '/api'

export function useApi() {
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const showMessage = useCallback((message: string, type: 'error' | 'success' = 'error') => {
    if (type === 'error') {
      setError(message)
      setTimeout(() => setError(null), 5000)
    } else {
      setSuccess(message)
      setTimeout(() => setSuccess(null), 3000)
    }
  }, [])

  const fetchCommandStats = useCallback(async (): Promise<CommandStats | null> => {
    try {
      const token = localStorage.getItem('slopsoil_token')
      const res = await fetch(`${API_URL}/stats`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      })
      if (!res.ok) throw new Error('Failed to fetch command stats')
      return await res.json()
    } catch (err) {
      showMessage(err instanceof Error ? err.message : 'Failed to fetch command stats')
      return null
    }
  }, [showMessage])

  const fetchConfig = useCallback(async (): Promise<{ settings: Config; settingsEnv: Record<string, {value: string, from_env: boolean}>; users: User[] } | null> => {
    try {
      const res = await fetch(`${API_URL}/config`)
      if (!res.ok) throw new Error('Failed to fetch config')
      const data = await res.json()
      
      // Transform settings from {key: {value, from_env}} to {key: value} for Config
      const settings: Config = {} as Config
      const settingsEnv: Record<string, {value: string, from_env: boolean}> = {}
      
      for (const [key, info] of Object.entries(data.settings)) {
        const settingInfo = info as {value: string, from_env: boolean}
        settingsEnv[key] = settingInfo
        // Handle type conversion for numeric fields
        if (key === 'stream_fps' || key === 'stream_av_sync_ms') {
          (settings as any)[key] = parseInt(settingInfo.value) || 0
        } else if (key === 'stream_packet_pace') {
          (settings as any)[key] = parseFloat(settingInfo.value) || 0
        } else {
          (settings as any)[key] = settingInfo.value
        }
      }
      
      return { settings, settingsEnv, users: data.users }
    } catch (err) {
      showMessage(err instanceof Error ? err.message : 'Failed to load config')
      return null
    }
  }, [showMessage])

  const fetchStatus = useCallback(async (): Promise<BotStatus | null> => {
    try {
      const res = await fetch(`${API_URL}/bot/status`)
      if (!res.ok) throw new Error('Failed to fetch status')
      return await res.json()
    } catch (err) {
      showMessage(err instanceof Error ? err.message : 'Failed to load status')
      return null
    }
  }, [showMessage])

  const fetchNowPlaying = useCallback(async (): Promise<NowPlaying[] | null> => {
    try {
      const res = await fetch(`${API_URL}/now-playing`)
      if (!res.ok) throw new Error('Failed to fetch now playing')
      const data = await res.json()
      return data.streams
    } catch (err) {
      showMessage(err instanceof Error ? err.message : 'Failed to load now playing')
      return null
    }
  }, [showMessage])

  const fetchGuilds = useCallback(async (): Promise<Guild[] | null> => {
    try {
      const res = await fetch(`${API_URL}/bot/guilds`)
      if (!res.ok) throw new Error('Failed to fetch guilds')
      const data = await res.json()
      return data.guilds
    } catch (err) {
      showMessage(err instanceof Error ? err.message : 'Failed to load guilds')
      return null
    }
  }, [showMessage])

  const fetchVoiceChannels = useCallback(async (guildId: string): Promise<VoiceChannel[] | null> => {
    if (!guildId) return []
    try {
      const res = await fetch(`${API_URL}/bot/guilds/${guildId}/channels`)
      if (!res.ok) throw new Error('Failed to fetch voice channels')
      const data = await res.json()
      return data.channels
    } catch (err) {
      showMessage(err instanceof Error ? err.message : 'Failed to load voice channels')
      return null
    }
  }, [showMessage])

  const fetchVoiceStatus = useCallback(async (): Promise<VoiceStatus | null> => {
    try {
      const res = await fetch(`${API_URL}/bot/voice-status`)
      if (!res.ok) throw new Error('Failed to fetch voice status')
      return await res.json()
    } catch (err) {
      showMessage(err instanceof Error ? err.message : 'Failed to load voice status')
      return null
    }
  }, [showMessage])

  const reloadBot = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch(`${API_URL}/bot/reload`, { method: 'POST' })
      if (!res.ok) throw new Error('Failed to reload bot')
      const data = await res.json()
      showMessage(data.message, 'success')
      return true
    } catch (err) {
      showMessage(err instanceof Error ? err.message : 'Failed to reload bot')
      return false
    }
  }, [showMessage])

  const joinVoiceChannel = useCallback(async (guildId: string, channelId: string): Promise<{ success: boolean; message: string } | null> => {
    try {
      const res = await fetch(`${API_URL}/bot/guilds/${guildId}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel_id: channelId }),
      })
      return await res.json()
    } catch (err) {
      showMessage(err instanceof Error ? err.message : 'Failed to join voice channel')
      return null
    }
  }, [showMessage])

  const leaveVoiceChannel = useCallback(async (guildId: string): Promise<{ success: boolean; message: string } | null> => {
    try {
      const res = await fetch(`${API_URL}/bot/guilds/${guildId}/leave`, { method: 'POST' })
      return await res.json()
    } catch (err) {
      showMessage(err instanceof Error ? err.message : 'Failed to leave voice channel')
      return null
    }
  }, [showMessage])

  const executeCommand = useCallback(async (guildId: string, command: string, args: string): Promise<CommandResult | null> => {
    try {
      const res = await fetch(`${API_URL}/bot/guilds/${guildId}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command, args }),
      })
      return await res.json()
    } catch (err) {
      showMessage(err instanceof Error ? err.message : 'Failed to execute command')
      return null
    }
  }, [showMessage])

  const saveConfig = useCallback(async (config: Config): Promise<boolean> => {
    try {
      const res = await fetch(`${API_URL}/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      })
      if (!res.ok) throw new Error('Failed to save config')
      showMessage('Configuration saved successfully', 'success')
      return true
    } catch (err) {
      showMessage(err instanceof Error ? err.message : 'Failed to save config')
      return false
    }
  }, [showMessage])

  const fetchIptvSources = useCallback(async (): Promise<IptvSource[] | null> => {
    try {
      const res = await fetch(`${API_URL}/iptv/sources`)
      if (!res.ok) throw new Error('Failed to fetch IPTV sources')
      return await res.json()
    } catch (err) {
      showMessage(err instanceof Error ? err.message : 'Failed to load IPTV sources')
      return null
    }
  }, [showMessage])

  const addIptvSource = useCallback(async (name: string, url: string): Promise<boolean> => {
    try {
      const res = await fetch(`${API_URL}/iptv/sources`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, url }),
      })
      if (!res.ok) throw new Error('Failed to add IPTV source')
      showMessage('IPTV source added successfully', 'success')
      return true
    } catch (err) {
      showMessage(err instanceof Error ? err.message : 'Failed to add IPTV source')
      return false
    }
  }, [showMessage])

  const toggleIptvSource = useCallback(async (name: string, enabled: boolean): Promise<boolean> => {
    try {
      const res = await fetch(`${API_URL}/iptv/sources/${encodeURIComponent(name)}/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      })
      if (!res.ok) throw new Error('Failed to toggle IPTV source')
      return true
    } catch (err) {
      showMessage(err instanceof Error ? err.message : 'Failed to toggle IPTV source')
      return false
    }
  }, [showMessage])

  const deleteIptvSource = useCallback(async (name: string): Promise<boolean> => {
    try {
      const res = await fetch(`${API_URL}/iptv/sources/${encodeURIComponent(name)}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete IPTV source')
      showMessage('IPTV source deleted successfully', 'success')
      return true
    } catch (err) {
      showMessage(err instanceof Error ? err.message : 'Failed to delete IPTV source')
      return false
    }
  }, [showMessage])

  const fetchBookmarks = useCallback(async (): Promise<Bookmark[] | null> => {
    try {
      const res = await fetch(`${API_URL}/bookmarks`)
      if (!res.ok) throw new Error('Failed to fetch bookmarks')
      return await res.json()
    } catch (err) {
      showMessage(err instanceof Error ? err.message : 'Failed to load bookmarks')
      return null
    }
  }, [showMessage])

  const addBookmark = useCallback(async (name: string, url: string): Promise<boolean> => {
    try {
      const res = await fetch(`${API_URL}/bookmarks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, url }),
      })
      if (!res.ok) throw new Error('Failed to add bookmark')
      showMessage('Bookmark added successfully', 'success')
      return true
    } catch (err) {
      showMessage(err instanceof Error ? err.message : 'Failed to add bookmark')
      return false
    }
  }, [showMessage])

  const toggleBookmark = useCallback(async (id: number, enabled: boolean): Promise<boolean> => {
    try {
      const res = await fetch(`${API_URL}/bookmarks/${id}/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      })
      if (!res.ok) throw new Error('Failed to toggle bookmark')
      return true
    } catch (err) {
      showMessage(err instanceof Error ? err.message : 'Failed to toggle bookmark')
      return false
    }
  }, [showMessage])

  const deleteBookmark = useCallback(async (id: number): Promise<boolean> => {
    try {
      const res = await fetch(`${API_URL}/bookmarks/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete bookmark')
      showMessage('Bookmark deleted successfully', 'success')
      return true
    } catch (err) {
      showMessage(err instanceof Error ? err.message : 'Failed to delete bookmark')
      return false
    }
  }, [showMessage])

  const fetchDiscordUser = useCallback(async (discordId: string): Promise<{ found: boolean; username?: string; avatar_url?: string | null } | null> => {
    try {
      const res = await fetch(`${API_URL}/discord/lookup/${discordId}`)
      if (!res.ok) throw new Error('Failed to lookup Discord user')
      return await res.json()
    } catch (err) {
      return null
    }
  }, [])

  // Music API methods
  const fetchMusicStatus = useCallback(async (): Promise<MusicStatus | null> => {
    try {
      const res = await fetch(`${API_URL}/music/status`)
      if (!res.ok) throw new Error('Failed to fetch music status')
      return await res.json()
    } catch (err) {
      showMessage(err instanceof Error ? err.message : 'Failed to load music status')
      return null
    }
  }, [showMessage])

  const playMusic = useCallback(async (guildId: string, query: string): Promise<{ success: boolean; message: string } | null> => {
    try {
      const res = await fetch(`${API_URL}/music/play`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guild_id: guildId, query }),
      })
      return await res.json()
    } catch (err) {
      showMessage(err instanceof Error ? err.message : 'Failed to play music')
      return null
    }
  }, [showMessage])

  const controlMusic = useCallback(async (guildId: string, action: 'stop' | 'skip' | 'back' | 'pause' | 'resume'): Promise<{ success: boolean; message: string } | null> => {
    try {
      const res = await fetch(`${API_URL}/music/control`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guild_id: guildId, action }),
      })
      return await res.json()
    } catch (err) {
      showMessage(err instanceof Error ? err.message : 'Failed to control music')
      return null
    }
  }, [showMessage])

  const setMusicVolume = useCallback(async (guildId: string, volume: number): Promise<{ success: boolean; message: string } | null> => {
    try {
      const res = await fetch(`${API_URL}/music/volume`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guild_id: guildId, volume }),
      })
      return await res.json()
    } catch (err) {
      showMessage(err instanceof Error ? err.message : 'Failed to set volume')
      return null
    }
  }, [showMessage])

  const fetchJellyfinLibraries = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/jellyfin/libraries`)
      if (!res.ok) throw new Error('Failed to fetch Jellyfin libraries')
      return await res.json()
    } catch (err) {
      showMessage(err instanceof Error ? err.message : 'Failed to fetch Jellyfin libraries')
      return null
    }
  }, [showMessage])

  const fetchJellyfinItems = useCallback(async (libraryId: string, sortBy: string = 'Name', sortOrder: string = 'Ascending', search: string = '') => {
    try {
      const params = new URLSearchParams({ sort_by: sortBy, sort_order: sortOrder })
      if (search) params.append('search', search)
      
      const res = await fetch(`${API_URL}/jellyfin/items/${libraryId}?${params}`)
      if (!res.ok) throw new Error('Failed to fetch Jellyfin items')
      return await res.json()
    } catch (err) {
      showMessage(err instanceof Error ? err.message : 'Failed to fetch Jellyfin items')
      return null
    }
  }, [showMessage])

  // Generic HTTP methods for user management
  const get = useCallback(async (endpoint: string) => {
    try {
      const res = await fetch(`${API_URL}${endpoint}`)
      if (!res.ok) throw new Error(`Failed to fetch ${endpoint}`)
      return await res.json()
    } catch (err) {
      showMessage(err instanceof Error ? err.message : `Failed to fetch ${endpoint}`)
      return null
    }
  }, [showMessage])

  const post = useCallback(async (endpoint: string, data: any) => {
    try {
      const res = await fetch(`${API_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        throw new Error(errorData.detail || `Failed to post to ${endpoint}`)
      }
      return await res.json()
    } catch (err) {
      showMessage(err instanceof Error ? err.message : `Failed to post to ${endpoint}`)
      return null
    }
  }, [showMessage])

  const deleteRequest = useCallback(async (endpoint: string) => {
    try {
      const res = await fetch(`${API_URL}${endpoint}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(`Failed to delete ${endpoint}`)
      return true
    } catch (err) {
      showMessage(err instanceof Error ? err.message : `Failed to delete ${endpoint}`)
      return false
    }
  }, [showMessage])

  return {
    error,
    success,
    showMessage,
    fetchConfig,
    fetchStatus,
    fetchNowPlaying,
    fetchGuilds,
    fetchVoiceChannels,
    fetchVoiceStatus,
    reloadBot,
    joinVoiceChannel,
    leaveVoiceChannel,
    executeCommand,
    saveConfig,
    fetchIptvSources,
    addIptvSource,
    toggleIptvSource,
    deleteIptvSource,
    fetchBookmarks,
    addBookmark,
    toggleBookmark,
    deleteBookmark,
    fetchDiscordUser,
    fetchCommandStats,
    fetchMusicStatus,
    playMusic,
    controlMusic,
    setMusicVolume,
    fetchJellyfinLibraries,
    fetchJellyfinItems,
    get,
    post,
    delete: deleteRequest,
  }
}
