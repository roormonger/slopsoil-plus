import { useState, useCallback } from 'react'
import type { Config, User, BotStatus, NowPlaying, IptvSource, IptvChannel, Bookmark, Sound, Guild, VoiceChannel, VoiceStatus, CommandResult, MusicStatus, FeaturedItem, TrackMeta } from '../types'

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
      const token = localStorage.getItem('slopsoil_token')
      const res = await fetch(`${API_URL}/bot/guilds`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
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

  const stopVoicePlayback = useCallback(async (guildId: string): Promise<{ success: boolean; message: string } | null> => {
    try {
      const res = await fetch(`${API_URL}/bot/guilds/${guildId}/stop`, { method: 'POST' })
      return await res.json()
    } catch (err) {
      showMessage(err instanceof Error ? err.message : 'Failed to stop playback')
      return null
    }
  }, [showMessage])

  const executeCommand = useCallback(async (guildId: string, command: string, args: string, channelId: string = ''): Promise<CommandResult | null> => {
    try {
      const res = await fetch(`${API_URL}/bot/guilds/${guildId}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command, args, channel_id: channelId || undefined }),
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

  const fetchYoutubeFeed = useCallback(async (limit = 20): Promise<TrackMeta[] | null> => {
    try {
      const res = await fetch(`${API_URL}/music/feed?limit=${limit}`)
      if (!res.ok) throw new Error('Failed to fetch feed')
      return await res.json()
    } catch {
      return null
    }
  }, [])

  const searchYoutube = useCallback(async (q: string, limit = 10): Promise<TrackMeta[] | null> => {
    try {
      const res = await fetch(`${API_URL}/music/search?q=${encodeURIComponent(q)}&limit=${limit}`)
      if (!res.ok) throw new Error('Failed to search')
      return await res.json()
    } catch {
      return null
    }
  }, [])

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

  const fetchIptvChannels = useCallback(async (name: string): Promise<IptvChannel[] | null> => {
    try {
      const res = await fetch(`${API_URL}/iptv/sources/${encodeURIComponent(name)}/channels`)
      if (!res.ok) throw new Error('Failed to fetch IPTV channels')
      return await res.json()
    } catch (err) {
      showMessage(err instanceof Error ? err.message : 'Failed to load IPTV channels')
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

  const uploadIptvSource = useCallback(async (name: string, file: File): Promise<boolean> => {
    try {
      const form = new FormData()
      form.append('name', name)
      form.append('file', file)
      const res = await fetch(`${API_URL}/iptv/sources/upload`, {
        method: 'POST',
        body: form,
      })
      if (!res.ok) throw new Error('Failed to upload IPTV source')
      showMessage('IPTV source uploaded successfully', 'success')
      return true
    } catch (err) {
      showMessage(err instanceof Error ? err.message : 'Failed to upload IPTV source')
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
      const res = await fetch(`${API_URL}/bot/discord/lookup/${discordId}`)
      if (!res.ok) throw new Error('Failed to lookup Discord user')
      return await res.json()
    } catch (err) {
      return null
    }
  }, [])

  // Audio API methods
  const fetchMusicStatus = useCallback(async (): Promise<MusicStatus | null> => {
    try {
      const res = await fetch(`${API_URL}/audio/status`)
      if (!res.ok) throw new Error('Failed to fetch audio status')
      return await res.json()
    } catch (err) {
      showMessage(err instanceof Error ? err.message : 'Failed to load audio status')
      return null
    }
  }, [showMessage])

  const playMusic = useCallback(async (guildId: string, query: string, channelId: string = ''): Promise<{ success: boolean; message: string } | null> => {
    try {
      const res = await fetch(`${API_URL}/audio/play`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guild_id: guildId, query, channel_id: channelId || undefined }),
      })
      return await res.json()
    } catch (err) {
      showMessage(err instanceof Error ? err.message : 'Failed to play audio')
      return null
    }
  }, [showMessage])

  const controlMusic = useCallback(async (guildId: string, action: 'stop' | 'skip' | 'back' | 'pause' | 'resume', channelId: string = ''): Promise<{ success: boolean; message: string } | null> => {
    try {
      const res = await fetch(`${API_URL}/audio/control`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guild_id: guildId, action, channel_id: channelId || undefined }),
      })
      return await res.json()
    } catch (err) {
      showMessage(err instanceof Error ? err.message : 'Failed to control audio')
      return null
    }
  }, [showMessage])

  const setMusicVolume = useCallback(async (guildId: string, volume: number, channelId: string = ''): Promise<{ success: boolean; message: string } | null> => {
    try {
      const res = await fetch(`${API_URL}/audio/volume`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guild_id: guildId, volume, channel_id: channelId || undefined }),
      })
      return await res.json()
    } catch (err) {
      showMessage(err instanceof Error ? err.message : 'Failed to set volume')
      return null
    }
  }, [showMessage])

  // Featured API methods
  const fetchFeatured = useCallback(async (category: string): Promise<{ items: FeaturedItem[]; enabled: boolean } | null> => {
    try {
      const res = await fetch(`${API_URL}/featured/${category}`)
      if (!res.ok) throw new Error('Failed to fetch featured items')
      return await res.json()
    } catch (err) {
      return null
    }
  }, [])

  const toggleFeatured = useCallback(async (category: string, itemId: string, metadata?: Record<string, any> | null): Promise<{ featured: boolean } | null> => {
    try {
      const token = localStorage.getItem('slopsoil_token')
      const res = await fetch(`${API_URL}/featured/${category}/toggle`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ item_id: itemId, metadata: metadata ?? null }),
      })
      if (!res.ok) throw new Error('Failed to toggle featured')
      return await res.json()
    } catch (err) {
      showMessage(err instanceof Error ? err.message : 'Failed to toggle featured')
      return null
    }
  }, [showMessage])

  const fetchFeaturedSettings = useCallback(async (): Promise<{ iptv: boolean; bookmarks: boolean; jellyfin: boolean; soundboard: boolean } | null> => {
    try {
      const res = await fetch(`${API_URL}/featured/settings/all`)
      if (!res.ok) throw new Error('Failed to fetch featured settings')
      return await res.json()
    } catch (err) {
      return null
    }
  }, [])

  const updateFeaturedSettings = useCallback(async (settings: Partial<{ iptv: boolean; bookmarks: boolean; jellyfin: boolean; soundboard: boolean }>): Promise<boolean> => {
    try {
      const token = localStorage.getItem('slopsoil_token')
      const res = await fetch(`${API_URL}/featured/settings/all`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(settings),
      })
      if (!res.ok) throw new Error('Failed to update featured settings')
      return true
    } catch (err) {
      showMessage(err instanceof Error ? err.message : 'Failed to update featured settings')
      return false
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

  const fetchJellyfinItems = useCallback(async (
    libraryId: string,
    sortBy: string = 'Name',
    sortOrder: string = 'Ascending',
    search: string = '',
    limit: number = 50,
    startIndex: number = 0,
    includeItemTypes?: string,
  ): Promise<{ items: any[]; total: number } | null> => {
    try {
      const params = new URLSearchParams({
        sort_by: sortBy,
        sort_order: sortOrder,
        limit: String(limit),
        start_index: String(startIndex),
      })
      if (search) params.append('search', search)
      if (includeItemTypes) params.append('include_item_types', includeItemTypes)
      const res = await fetch(`${API_URL}/jellyfin/items/${libraryId}?${params}`)
      if (!res.ok) throw new Error('Failed to fetch Jellyfin items')
      return await res.json()
    } catch (err) {
      showMessage(err instanceof Error ? err.message : 'Failed to fetch Jellyfin items')
      return null
    }
  }, [showMessage])

  const fetchJellyfinByNames = useCallback(async (names: string[]): Promise<any[] | null> => {
    try {
      const res = await fetch(`${API_URL}/jellyfin/by-names`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(names),
      })
      if (!res.ok) throw new Error('Failed to fetch Jellyfin items by names')
      return await res.json()
    } catch (err) {
      showMessage(err instanceof Error ? err.message : 'Failed to fetch Jellyfin items by names')
      return null
    }
  }, [showMessage])

  const fetchJellyfinSeasons = useCallback(async (seriesId: string): Promise<any[] | null> => {
    try {
      const res = await fetch(`${API_URL}/jellyfin/series/${seriesId}/seasons`)
      if (!res.ok) throw new Error('Failed to fetch seasons')
      return await res.json()
    } catch (err) {
      showMessage(err instanceof Error ? err.message : 'Failed to fetch seasons')
      return null
    }
  }, [showMessage])

  const fetchJellyfinEpisodes = useCallback(async (seriesId: string, seasonId: string): Promise<any[] | null> => {
    try {
      const res = await fetch(`${API_URL}/jellyfin/series/${seriesId}/seasons/${seasonId}/episodes`)
      if (!res.ok) throw new Error('Failed to fetch episodes')
      return await res.json()
    } catch (err) {
      showMessage(err instanceof Error ? err.message : 'Failed to fetch episodes')
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

  const fetchSystemSounds = useCallback(async (): Promise<Sound[] | null> => {
    try {
      const res = await fetch(`${API_URL}/soundboard/system`)
      if (!res.ok) throw new Error('Failed to fetch system sounds')
      return await res.json()
    } catch (err) {
      showMessage(err instanceof Error ? err.message : 'Failed to fetch system sounds')
      return null
    }
  }, [showMessage])

  const fetchMySounds = useCallback(async (): Promise<Sound[] | null> => {
    try {
      const token = localStorage.getItem('slopsoil_token')
      const res = await fetch(`${API_URL}/soundboard/mine`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      })
      if (!res.ok) throw new Error('Failed to fetch personal sounds')
      return await res.json()
    } catch (err) {
      showMessage(err instanceof Error ? err.message : 'Failed to fetch personal sounds')
      return null
    }
  }, [showMessage])

  const uploadSystemSound = useCallback(async (file: File): Promise<boolean> => {
    try {
      const token = localStorage.getItem('slopsoil_token')
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch(`${API_URL}/soundboard/system`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: formData,
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.detail || 'Failed to upload system sound')
      }
      showMessage('System sound uploaded', 'success')
      return true
    } catch (err) {
      showMessage(err instanceof Error ? err.message : 'Failed to upload system sound')
      return false
    }
  }, [showMessage])

  const uploadPersonalSound = useCallback(async (file: File): Promise<boolean> => {
    try {
      const token = localStorage.getItem('slopsoil_token')
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch(`${API_URL}/soundboard/mine`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: formData,
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.detail || 'Failed to upload personal sound')
      }
      showMessage('Personal sound uploaded', 'success')
      return true
    } catch (err) {
      showMessage(err instanceof Error ? err.message : 'Failed to upload personal sound')
      return false
    }
  }, [showMessage])

  const deleteSystemSound = useCallback(async (filename: string): Promise<boolean> => {
    try {
      const token = localStorage.getItem('slopsoil_token')
      const res = await fetch(`${API_URL}/soundboard/system/${encodeURIComponent(filename)}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      })
      if (!res.ok) throw new Error('Failed to delete system sound')
      showMessage('System sound deleted', 'success')
      return true
    } catch (err) {
      showMessage(err instanceof Error ? err.message : 'Failed to delete system sound')
      return false
    }
  }, [showMessage])

  const deletePersonalSound = useCallback(async (filename: string): Promise<boolean> => {
    try {
      const token = localStorage.getItem('slopsoil_token')
      const res = await fetch(`${API_URL}/soundboard/mine/${encodeURIComponent(filename)}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      })
      if (!res.ok) throw new Error('Failed to delete personal sound')
      showMessage('Personal sound deleted', 'success')
      return true
    } catch (err) {
      showMessage(err instanceof Error ? err.message : 'Failed to delete personal sound')
      return false
    }
  }, [showMessage])

  const playSound = useCallback(async (filename: string, type: 'system' | 'personal', guildId: string, channelId: string): Promise<boolean> => {
    try {
      const token = localStorage.getItem('slopsoil_token')
      const res = await fetch(`${API_URL}/soundboard/play`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ filename, type, guild_id: guildId, channel_id: channelId }),
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.detail || 'Failed to play sound')
      }
      return true
    } catch (err) {
      showMessage(err instanceof Error ? err.message : 'Failed to play sound')
      return false
    }
  }, [showMessage])

  const fetchSoundTags = useCallback(async (filename: string, type: 'system' | 'personal'): Promise<string[] | null> => {
    try {
      const token = localStorage.getItem('slopsoil_token')
      const endpoint = type === 'system' ? 'system' : 'mine'
      const res = await fetch(`${API_URL}/soundboard/${endpoint}/${encodeURIComponent(filename)}/tags`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      })
      if (!res.ok) throw new Error('Failed to fetch sound tags')
      const data = await res.json()
      return data.tags
    } catch (err) {
      showMessage(err instanceof Error ? err.message : 'Failed to fetch tags')
      return null
    }
  }, [showMessage])

  const updateSoundTags = useCallback(async (filename: string, type: 'system' | 'personal', tags: string[]): Promise<string[] | null> => {
    try {
      const token = localStorage.getItem('slopsoil_token')
      const endpoint = type === 'system' ? 'system' : 'mine'
      const res = await fetch(`${API_URL}/soundboard/${endpoint}/${encodeURIComponent(filename)}/tags`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ tags }),
      })
      if (!res.ok) throw new Error('Failed to update tags')
      const data = await res.json()
      return data.tags
    } catch (err) {
      showMessage(err instanceof Error ? err.message : 'Failed to update tags')
      return null
    }
  }, [showMessage])

  const getSoundAudioUrl = useCallback((filename: string, type: 'system' | 'personal'): string => {
    const token = localStorage.getItem('slopsoil_token')
    const endpoint = type === 'system' ? 'system' : 'mine'
    const url = `${API_URL}/soundboard/${endpoint}/${encodeURIComponent(filename)}/audio`
    return token ? `${url}?token=${encodeURIComponent(token)}` : url
  }, [])

  const fetchUsers = useCallback(async (): Promise<User[] | null> => {
    try {
      const token = localStorage.getItem('slopsoil_token')
      const res = await fetch(`${API_URL}/users`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      })
      if (!res.ok) throw new Error('Failed to fetch users')
      return await res.json()
    } catch (err) {
      showMessage(err instanceof Error ? err.message : 'Failed to fetch users')
      return null
    }
  }, [showMessage])

  const fetchUsersWithSounds = useCallback(async (): Promise<{ user_id: string; username: string }[] | null> => {
    try {
      const token = localStorage.getItem('slopsoil_token')
      const res = await fetch(`${API_URL}/soundboard/users-with-sounds`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      })
      if (!res.ok) throw new Error('Failed to fetch users with sounds')
      return await res.json()
    } catch (err) {
      showMessage(err instanceof Error ? err.message : 'Failed to fetch users with sounds')
      return null
    }
  }, [showMessage])

  const fetchUserSounds = useCallback(async (userId: string): Promise<Sound[] | null> => {
    try {
      const token = localStorage.getItem('slopsoil_token')
      const res = await fetch(`${API_URL}/soundboard/users/${encodeURIComponent(userId)}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      })
      if (!res.ok) throw new Error('Failed to fetch user sounds')
      return await res.json()
    } catch (err) {
      showMessage(err instanceof Error ? err.message : 'Failed to fetch user sounds')
      return null
    }
  }, [showMessage])

  const updateUserSoundTags = useCallback(async (userId: string, filename: string, tags: string[]): Promise<string[] | null> => {
    try {
      const token = localStorage.getItem('slopsoil_token')
      const res = await fetch(`${API_URL}/soundboard/users/${encodeURIComponent(userId)}/${encodeURIComponent(filename)}/tags`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ tags }),
      })
      if (!res.ok) throw new Error('Failed to update tags')
      const data = await res.json()
      return data.tags
    } catch (err) {
      showMessage(err instanceof Error ? err.message : 'Failed to update tags')
      return null
    }
  }, [showMessage])

  const deleteUserSound = useCallback(async (userId: string, filename: string): Promise<boolean> => {
    try {
      const token = localStorage.getItem('slopsoil_token')
      const res = await fetch(`${API_URL}/soundboard/users/${encodeURIComponent(userId)}/${encodeURIComponent(filename)}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      })
      if (!res.ok) throw new Error('Failed to delete sound')
      return true
    } catch (err) {
      showMessage(err instanceof Error ? err.message : 'Failed to delete sound')
      return false
    }
  }, [showMessage])

  const getUserSoundAudioUrl = useCallback((userId: string, filename: string): string => {
    const token = localStorage.getItem('slopsoil_token')
    const url = `${API_URL}/soundboard/users/${encodeURIComponent(userId)}/${encodeURIComponent(filename)}/audio`
    return token ? `${url}?token=${encodeURIComponent(token)}` : url
  }, [])

  const updateSystemSoundCover = useCallback(async (filename: string, imageFile: File): Promise<boolean> => {
    try {
      const token = localStorage.getItem('slopsoil_token')
      const form = new FormData()
      form.append('file', imageFile)
      const res = await fetch(`${API_URL}/soundboard/system/${encodeURIComponent(filename)}/cover`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: form,
      })
      if (!res.ok) throw new Error('Failed to update cover art')
      return true
    } catch (err) {
      showMessage(err instanceof Error ? err.message : 'Failed to update cover art')
      return false
    }
  }, [showMessage])

  const renameSystemSound = useCallback(async (filename: string, newName: string): Promise<Sound | null> => {
    try {
      const token = localStorage.getItem('slopsoil_token')
      const res = await fetch(`${API_URL}/soundboard/system/${encodeURIComponent(filename)}/rename`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ new_name: newName }),
      })
      if (!res.ok) throw new Error('Failed to rename sound')
      return await res.json()
    } catch (err) {
      showMessage(err instanceof Error ? err.message : 'Failed to rename sound')
      return null
    }
  }, [showMessage])

  const updateUserSoundCover = useCallback(async (userId: string, filename: string, imageFile: File): Promise<boolean> => {
    try {
      const token = localStorage.getItem('slopsoil_token')
      const form = new FormData()
      form.append('file', imageFile)
      const res = await fetch(`${API_URL}/soundboard/users/${encodeURIComponent(userId)}/${encodeURIComponent(filename)}/cover`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: form,
      })
      if (!res.ok) throw new Error('Failed to update cover art')
      return true
    } catch (err) {
      showMessage(err instanceof Error ? err.message : 'Failed to update cover art')
      return false
    }
  }, [showMessage])

  const renameUserSound = useCallback(async (userId: string, filename: string, newName: string): Promise<Sound | null> => {
    try {
      const token = localStorage.getItem('slopsoil_token')
      const res = await fetch(`${API_URL}/soundboard/users/${encodeURIComponent(userId)}/${encodeURIComponent(filename)}/rename`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ new_name: newName }),
      })
      if (!res.ok) throw new Error('Failed to rename sound')
      return await res.json()
    } catch (err) {
      showMessage(err instanceof Error ? err.message : 'Failed to rename sound')
      return null
    }
  }, [showMessage])

  const updatePersonalSoundCover = useCallback(async (filename: string, imageFile: File): Promise<boolean> => {
    try {
      const token = localStorage.getItem('slopsoil_token')
      const form = new FormData()
      form.append('file', imageFile)
      const res = await fetch(`${API_URL}/soundboard/mine/${encodeURIComponent(filename)}/cover`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: form,
      })
      if (!res.ok) throw new Error('Failed to update cover art')
      return true
    } catch (err) {
      showMessage(err instanceof Error ? err.message : 'Failed to update cover art')
      return false
    }
  }, [showMessage])

  const renamePersonalSound = useCallback(async (filename: string, newName: string): Promise<Sound | null> => {
    try {
      const token = localStorage.getItem('slopsoil_token')
      const res = await fetch(`${API_URL}/soundboard/mine/${encodeURIComponent(filename)}/rename`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ new_name: newName }),
      })
      if (!res.ok) throw new Error('Failed to rename sound')
      return await res.json()
    } catch (err) {
      showMessage(err instanceof Error ? err.message : 'Failed to rename sound')
      return null
    }
  }, [showMessage])

  const getUserSoundCoverUrl = useCallback((userId: string, filename: string): string => {
    const token = localStorage.getItem('slopsoil_token')
    const url = `${API_URL}/soundboard/users/${encodeURIComponent(userId)}/${encodeURIComponent(filename)}/cover`
    return token ? `${url}?token=${encodeURIComponent(token)}` : url
  }, [])

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
    stopVoicePlayback,
    executeCommand,
    saveConfig,
    fetchIptvSources,
    fetchIptvChannels,
    addIptvSource,
    uploadIptvSource,
    toggleIptvSource,
    deleteIptvSource,
    fetchBookmarks,
    addBookmark,
    deleteBookmark,
    fetchDiscordUser,
    fetchMusicStatus,
    playMusic,
    controlMusic,
    setMusicVolume,
    fetchJellyfinLibraries,
    fetchJellyfinItems,
    fetchJellyfinSeasons,
    fetchJellyfinEpisodes,
    fetchJellyfinByNames,
    get,
    post,
    delete: deleteRequest,
    fetchSystemSounds,
    fetchMySounds,
    uploadSystemSound,
    uploadPersonalSound,
    deleteSystemSound,
    deletePersonalSound,
    playSound,
    fetchSoundTags,
    updateSoundTags,
    getSoundAudioUrl,
    fetchUsers,
    fetchUsersWithSounds,
    fetchUserSounds,
    updateUserSoundTags,
    deleteUserSound,
    getUserSoundAudioUrl,
    getUserSoundCoverUrl,
    updatePersonalSoundCover,
    renamePersonalSound,
    updateSystemSoundCover,
    renameSystemSound,
    updateUserSoundCover,
    renameUserSound,
    fetchFeatured,
    toggleFeatured,
    fetchFeaturedSettings,
    updateFeaturedSettings,
    fetchYoutubeFeed,
    searchYoutube,
  }
}
