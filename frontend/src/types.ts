export interface SettingInfo {
  value: string
  from_env: boolean
}

export interface Config {
  discord_token: string
  discord_avatar_url: string
  command_prefix: string
  tvheadend_url: string
  tvheadend_user: string
  tvheadend_pass: string
  jellyfin_url: string
  jellyfin_api_key: string
  timezone: string
  ytdlp_format: string
  stream_quality: string
  stream_resolution: string
  stream_fps: number
  stream_video_bitrate: string
  stream_packet_pace: number
  stream_av_sync_ms: number
}

// New interface for settings with source info from API
export interface SettingsWithEnv {
  discord_token: SettingInfo
  discord_avatar_url: SettingInfo
  command_prefix: SettingInfo
  tvheadend_url: SettingInfo
  tvheadend_user: SettingInfo
  tvheadend_pass: SettingInfo
  jellyfin_url: SettingInfo
  jellyfin_api_key: SettingInfo
  timezone: SettingInfo
  ytdlp_format: SettingInfo
  stream_quality: SettingInfo
  stream_resolution: SettingInfo
  stream_fps: SettingInfo
  stream_video_bitrate: SettingInfo
  stream_packet_pace: SettingInfo
  stream_av_sync_ms: SettingInfo
}

export interface User {
  user_id: string
  username: string
  avatar: string | null
  discord_id: string | null
  role: string
  bookmarks_video: any[]
  bookmarks_voice: any[]
  created_at: string
  updated_at: string
}

export interface BotInfo {
  id: string
  name: string
  avatar_url: string | null
}

export interface BotStatus {
  status: string
  running: boolean
  has_token: boolean
  user_count: number
  streaming_count: number
  guild_count: number
  uptime: number
  bot: BotInfo | null
}

export interface CommandStats {
  total: number
  by_source: Record<string, number>
  by_category: {
    voice: number
    video: number
    music: number
    other: number
  }
  by_user: Array<{ user_id: string; username: string; count: number }>
}

export interface NowPlaying {
  guild_id: number
  guild_name: string
  title: string
  url: string
  started_at: string
}

export interface IptvSource {
  name: string
  url: string
  enabled: boolean
  channel_count: number
}

export interface Bookmark {
  id: number
  name: string
  url: string
  enabled: boolean
}

export interface Guild {
  id: string
  name: string
  icon_url?: string
}

export interface VoiceChannel {
  id: string
  name: string
}

export interface VoiceStatus {
  connected: boolean
  guild_id?: string
  guild_name?: string
  channel_id?: string
  channel_name?: string
}

export interface CommandResult {
  success?: boolean
  message?: string
}

export type Tab = 'dashboard' | 'users' | 'iptv' | 'bookmarks' | 'soundboard' | 'music' | 'settings'

export interface MusicTrack {
  url: string
  title: string
  duration: number
  thumbnail: string
  requested_by: string
  webpage_url: string
}

export interface MusicStatus {
  current: MusicTrack | null
  queue: MusicTrack[]
  queue_length: number
  volume: number
  is_playing: boolean
  is_paused: boolean
}

export type JellyfinItemType = 'Movie' | 'Series' | 'Episode' | 'MusicAlbum' | 'MusicArtist' | 'Book'

export interface JellyfinItem {
  Id: string
  Name: string
  Type: JellyfinItemType
  ProductionYear?: number
  PremiereDate?: string
  CommunityRating?: number
  RunTimeTicks?: number
  Overview?: string
  ImageTags?: {
    Primary?: string
  }
  UserData?: {
    Played?: boolean
    IsFavorite?: boolean
  }
}

export interface JellyfinLibrary {
  Name: string
  Id: string
  Type: string
  CollectionType: string
}

export const timezones = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Australia/Sydney',
  'Pacific/Auckland',
]
