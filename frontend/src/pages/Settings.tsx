import { useState, useEffect } from 'react'
import { Loader2, Eye, EyeOff, Lock, Zap, Star, LayoutDashboard, Settings2, Database, Radio } from 'lucide-react'
import type { BotStatus } from '../types'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { useApi } from '../hooks/useApi'
import { timezones, type Config } from '../types'

type TabKey = 'dashboard' | 'system' | 'sources' | 'streaming'

const TABS: { key: TabKey; label: string; icon: typeof Settings2 }[] = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'system', label: 'System', icon: Settings2 },
  { key: 'sources', label: 'Sources', icon: Database },
  { key: 'streaming', label: 'Streaming', icon: Radio },
]

const NITRO_LABELS: Record<number, string> = {
  0: 'No Nitro',
  1: 'Nitro Classic',
  2: 'Nitro',
  3: 'Nitro Basic',
}

const YTDLP_FORMATS: { label: string; value: string; description: string }[] = [
  { label: 'Best video + best audio',          value: 'bestvideo+bestaudio/best',                          description: 'Highest quality — merges best video and best audio streams' },
  { label: 'Best video + best audio (MP4)',    value: 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best', description: 'Best quality in MP4 container (M4A audio)' },
  { label: '4K max + best audio',              value: 'bestvideo[height<=2160]+bestaudio/best[height<=2160]', description: 'Up to 4K (2160p) video with best available audio' },
  { label: '1080p max + best audio',           value: 'bestvideo[height<=1080]+bestaudio/best[height<=1080]', description: 'Video capped at 1080p with best available audio' },
  { label: '1080p max + best audio (MP4)',     value: 'bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080][ext=mp4]', description: '1080p video with M4A audio in MP4 container' },
  { label: '720p max + best audio',            value: 'bestvideo[height<=720]+bestaudio/best[height<=720]',  description: 'Video capped at 720p with best available audio' },
  { label: '720p max + best audio (MP4)',      value: 'bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720][ext=mp4]', description: '720p video with M4A audio in MP4 container' },
  { label: '480p max + best audio',            value: 'bestvideo[height<=480]+bestaudio/best[height<=480]',  description: 'Video capped at 480p with best available audio' },
  { label: 'Audio only — best (Opus)',         value: 'bestaudio[ext=opus]/bestaudio',                      description: 'Audio only, prefer Opus codec (best for Discord)' },
  { label: 'Audio only — best (M4A/AAC)',      value: 'bestaudio[ext=m4a]/bestaudio',                       description: 'Audio only, prefer M4A/AAC codec' },
  { label: 'Worst video + worst audio',        value: 'worstvideo+worstaudio/worst',                         description: 'Lowest quality — minimal bandwidth usage' },
]

const NITRO_LIMITS: Record<number, { quality: string; fps: number; resolution: string; bitrate: string }> = {
  0: { quality: '720p',  fps: 30, resolution: '1280:720',  bitrate: '8000k' },
  1: { quality: '1080p', fps: 30, resolution: '1920:1080', bitrate: '8000k' },
  2: { quality: '1080p', fps: 60, resolution: '1920:1080', bitrate: '100000k' },
  3: { quality: '1080p', fps: 30, resolution: '1920:1080', bitrate: '8000k' },
}

export function Settings() {
  const api = useApi()
  const [activeTab, setActiveTab] = useState<TabKey>('dashboard')
  const [featuredSettings, setFeaturedSettings] = useState({ iptv: true, bookmarks: true, jellyfin: true, soundboard: true })
  const [savingFeatured, setSavingFeatured] = useState(false)
  const [config, setConfig] = useState<Config>({
    discord_token: '',
    discord_avatar_url: '',
    command_prefix: '!',
    tvheadend_url: '',
    tvheadend_user: '',
    tvheadend_pass: '',
    jellyfin_url: '',
    jellyfin_api_key: '',
    timezone: '',
    ytdlp_format: 'bestvideo+bestaudio/best',
    stream_quality: '1080p',
    stream_resolution: '1920:1080',
    stream_fps: 60,
    stream_video_bitrate: '6000k',
    stream_packet_pace: 0,
    stream_av_sync_ms: 0,
    soundboard_user_quota: 10,
  })
  const [settingsEnv, setSettingsEnv] = useState<Record<string, {value: string, from_env: boolean}>>({})
  const [showToken, setShowToken] = useState(false)
  const [showTvPass, setShowTvPass] = useState(false)
  const [showJfKey, setShowJfKey] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [botStatus, setBotStatus] = useState<BotStatus | null>(null)

  const isEnvControlled = (key: keyof Config): boolean => {
    const result = settingsEnv[key as string]?.from_env ?? false
    if (key.includes('jellyfin')) {
      console.log(`isEnvControlled(${key}):`, result, 'settingsEnv[key]:', settingsEnv[key as string])
    }
    return result
  }

  const handleToggleFeaturedSection = async (key: 'iptv' | 'bookmarks' | 'jellyfin' | 'soundboard') => {
    const newValue = !featuredSettings[key]
    setSavingFeatured(true)
    const ok = await api.updateFeaturedSettings({ [key]: newValue })
    if (ok) setFeaturedSettings(prev => ({ ...prev, [key]: newValue }))
    setSavingFeatured(false)
  }

  useEffect(() => {
    const loadData = async () => {
      const [data, status] = await Promise.all([api.fetchConfig(), api.fetchStatus()])
      if (status) setBotStatus(status)
      console.log('API response data:', data)
      if (data) {
        setConfig(data.settings)
        setSettingsEnv(data.settingsEnv)
        console.log('settingsEnv set to:', data.settingsEnv)
        console.log('jellyfin_url from_env:', data.settingsEnv['jellyfin_url']?.from_env)
      }
      const fs = await api.fetchFeaturedSettings()
      if (fs) setFeaturedSettings(fs)
      setLoading(false)
    }
    loadData()
  }, [])

  const handleSave = async () => {
    setSaving(true)
    await api.saveConfig(config)
    setSaving(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {api.error && <div className="p-4 glass-card border-red-400/30 text-red-300 rounded-xl">{api.error}</div>}
      {api.success && <div className="p-4 glass-card border-emerald-400/30 text-emerald-300 rounded-xl">{api.success}</div>}

      <div className="mb-8">
        <h2 className="text-3xl font-bold gradient-text mb-2">Settings</h2>
        <p className="text-slate-400">Configure bot and media server connections</p>
      </div>

      {/* Tab Bar */}
      <div className="flex gap-2">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setActiveTab(key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
              activeTab === key
                ? 'bg-primary/20 text-primary border border-primary/30'
                : 'glass-light border-white/10 text-slate-400 hover:bg-white/5'
            }`}>
            <Icon className="w-4 h-4" />{label}
          </button>
        ))}
      </div>

      {/* Container */}
      <div className="glass-card rounded-2xl p-6">
        <h3 className="text-xl font-semibold text-slate-200 capitalize">{activeTab}</h3>
        <p className="text-sm text-slate-400 mt-1">Options for {activeTab} will go here</p>
      </div>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving} className="gap-2 bg-primary/20 text-primary border border-primary/30 hover:bg-primary/30">
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          Save Configuration
        </Button>
      </div>
    </div>
  )
}
