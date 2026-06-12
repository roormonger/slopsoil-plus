import { useState, useEffect, useRef } from 'react'
import { Loader2, Eye, EyeOff, Lock, Zap, Star, LayoutDashboard, Settings2, Database, Radio, Plus, Upload, Trash2 } from 'lucide-react'
import type { BotStatus, IptvSource } from '../types'
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
    audio_genres: '[]',
    audio_playlists: '[]',
  })
  const [settingsEnv, setSettingsEnv] = useState<Record<string, {value: string, from_env: boolean}>>({})
  const [showToken, setShowToken] = useState(false)
  const [showTvPass, setShowTvPass] = useState(false)
  const [showJfKey, setShowJfKey] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [botStatus, setBotStatus] = useState<BotStatus | null>(null)

  // Audio genres/playlists state
  const [audioGenreInput, setAudioGenreInput] = useState('')
  const [audioPlaylistInput, setAudioPlaylistInput] = useState('')
  const [savingAudio, setSavingAudio] = useState(false)

  const audioGenres: string[] = (() => { try { return JSON.parse(config.audio_genres || '[]') } catch { return [] } })()
  const audioPlaylists: string[] = (() => { try { return JSON.parse(config.audio_playlists || '[]') } catch { return [] } })()

  const addAudioGenre = () => {
    const g = audioGenreInput.trim()
    if (!g || audioGenres.includes(g)) return
    setConfig(prev => ({ ...prev, audio_genres: JSON.stringify([...audioGenres, g]) }))
    setAudioGenreInput('')
  }

  const removeAudioGenre = (g: string) => {
    setConfig(prev => ({ ...prev, audio_genres: JSON.stringify(audioGenres.filter(x => x !== g)) }))
  }

  const addAudioPlaylist = () => {
    const p = audioPlaylistInput.trim()
    if (!p || audioPlaylists.includes(p)) return
    setConfig(prev => ({ ...prev, audio_playlists: JSON.stringify([...audioPlaylists, p]) }))
    setAudioPlaylistInput('')
  }

  const removeAudioPlaylist = (p: string) => {
    setConfig(prev => ({ ...prev, audio_playlists: JSON.stringify(audioPlaylists.filter(x => x !== p)) }))
  }

  const handleSaveAudio = async () => {
    setSavingAudio(true)
    await api.saveConfig(config)
    setSavingAudio(false)
  }

  // IPTV Playlists state
  const [iptvSources, setIptvSources] = useState<IptvSource[]>([])
  const [showIptvModal, setShowIptvModal] = useState(false)
  const [newSourceName, setNewSourceName] = useState('')
  const [newSourceUrl, setNewSourceUrl] = useState('')
  const [sourceNameError, setSourceNameError] = useState('')
  const [sourceUrlError, setSourceUrlError] = useState('')
  const [addingSource, setAddingSource] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [modalDragOver, setModalDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

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

  // IPTV Playlists handlers
  const loadIptvSources = async () => {
    const data = await api.fetchIptvSources()
    if (data) setIptvSources(data)
  }

  const openIptvModal = () => {
    setShowIptvModal(true)
    setNewSourceName('')
    setNewSourceUrl('')
    setSourceNameError('')
    setSourceUrlError('')
  }

  const handleAddSource = async () => {
    let hasError = false
    if (!newSourceName.trim()) {
      setSourceNameError('Name is required')
      hasError = true
    } else if (iptvSources.some(s => s.name.toLowerCase() === newSourceName.trim().toLowerCase())) {
      setSourceNameError('A source with this name already exists')
      hasError = true
    }
    if (!newSourceUrl.trim()) {
      setSourceUrlError('URL is required')
      hasError = true
    } else if (!newSourceUrl.match(/^https?:\/\/.+/i)) {
      setSourceUrlError('Please enter a valid HTTP or HTTPS URL')
      hasError = true
    }
    if (hasError) return

    setAddingSource(true)
    const success = await api.addIptvSource(newSourceName.trim(), newSourceUrl.trim())
    if (success) {
      setShowIptvModal(false)
      setNewSourceName('')
      setNewSourceUrl('')
      await loadIptvSources()
    }
    setAddingSource(false)
  }

  const handleDeleteSource = async (name: string) => {
    const success = await api.deleteIptvSource(name)
    if (success) await loadIptvSources()
  }

  const handleToggleSource = async (name: string) => {
    const source = iptvSources.find(s => s.name === name)
    if (!source) return
    const success = await api.toggleIptvSource(name, !source.enabled)
    if (success) await loadIptvSources()
  }

  const handleFileDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
    const files = Array.from(e.dataTransfer.files)
    const m3u = files.find(f => f.name.match(/\.(m3u|m3u8)$/i))
    if (!m3u) {
      api.showMessage('Please drop an .m3u or .m3u8 file', 'error')
      return
    }
    const baseName = m3u.name.replace(/\.(m3u|m3u8)$/i, '')
    let name = baseName
    let counter = 1
    while (iptvSources.some(s => s.name.toLowerCase() === name.toLowerCase())) {
      name = `${baseName} (${counter})`
      counter++
    }
    setAddingSource(true)
    const success = await api.uploadIptvSource(name, m3u)
    if (success) await loadIptvSources()
    setAddingSource(false)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
  }

  const handleModalDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setModalDragOver(true)
  }

  const handleModalDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setModalDragOver(false)
  }

  const handleModalFileDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setModalDragOver(false)
    const files = Array.from(e.dataTransfer.files)
    const m3u = files.find(f => f.name.match(/\.(m3u|m3u8)$/i))
    if (!m3u) {
      api.showMessage('Please drop an .m3u or .m3u8 file', 'error')
      return
    }
    const baseName = m3u.name.replace(/\.(m3u|m3u8)$/i, '')
    let name = baseName
    let counter = 1
    while (iptvSources.some(s => s.name.toLowerCase() === name.toLowerCase())) {
      name = `${baseName} (${counter})`
      counter++
    }
    setAddingSource(true)
    const success = await api.uploadIptvSource(name, m3u)
    if (success) {
      setShowIptvModal(false)
      await loadIptvSources()
    }
    setAddingSource(false)
  }

  const handleBrowseFile = async (file: File) => {
    if (!file.name.match(/\.(m3u|m3u8)$/i)) {
      api.showMessage('Please select an .m3u or .m3u8 file', 'error')
      return
    }
    const baseName = file.name.replace(/\.(m3u|m3u8)$/i, '')
    let name = baseName
    let counter = 1
    while (iptvSources.some(s => s.name.toLowerCase() === name.toLowerCase())) {
      name = `${baseName} (${counter})`
      counter++
    }
    setAddingSource(true)
    const success = await api.uploadIptvSource(name, file)
    if (success) {
      setShowIptvModal(false)
      await loadIptvSources()
    }
    setAddingSource(false)
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
      await loadIptvSources()
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

      {/* Dashboard Tab */}
      {activeTab === 'dashboard' && (
        <div className="glass-card rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <Star className="w-5 h-5 text-primary" />
            <div>
              <h3 className="text-xl font-semibold text-slate-200">Featured Sections</h3>
              <p className="text-sm text-slate-400">Choose which categories appear on the Dashboard</p>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {(['iptv', 'bookmarks', 'jellyfin', 'soundboard'] as const).map(key => (
              <button
                key={key}
                onClick={() => handleToggleFeaturedSection(key)}
                disabled={savingFeatured}
                className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                  featuredSettings[key]
                    ? 'bg-primary/10 border-primary/40 text-primary'
                    : 'glass-light border-white/10 text-slate-400 hover:border-white/20'
                }`}
              >
                <span className="text-sm font-medium capitalize">{key === 'iptv' ? 'IPTV' : key}</span>
                <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 ${
                  featuredSettings[key] ? 'bg-primary border-primary' : 'border-slate-500'
                }`} />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* System Tab */}
      {activeTab === 'system' && (
        <div className="glass-card rounded-2xl p-6 space-y-6">
          <div>
            <h3 className="text-xl font-semibold text-slate-200 mb-1">System</h3>
            <p className="text-sm text-slate-400">Discord bot and system settings</p>
          </div>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-400 flex items-center gap-2">
                Discord Bot Token
                {isEnvControlled('discord_token') && (
                  <span className="text-xs text-amber-400 flex items-center gap-1" title="Controlled by DISCORD_TOKEN environment variable">
                    <Lock className="h-3 w-3" />
                    (env)
                  </span>
                )}
              </label>
              <div className="relative">
                <Input
                  type={showToken ? 'text' : 'password'}
                  value={config.discord_token}
                  onChange={(e) => setConfig({ ...config, discord_token: e.target.value })}
                  placeholder="Enter Discord bot token"
                  className="pr-10 glass-input text-slate-200"
                  disabled={isEnvControlled('discord_token')}
                />
                <button
                  type="button"
                  onClick={() => setShowToken(!showToken)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 disabled:opacity-50"
                  disabled={isEnvControlled('discord_token')}
                >
                  {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-400 flex items-center gap-2">
                Command Prefix
                {isEnvControlled('command_prefix') && (
                  <span className="text-xs text-amber-400 flex items-center gap-1" title="Controlled by COMMAND_PREFIX environment variable">
                    <Lock className="h-3 w-3" />
                    (env)
                  </span>
                )}
              </label>
              <Input
                value={config.command_prefix}
                onChange={(e) => {
                  const val = e.target.value.slice(0, 1)
                  if (!val || /[!$%^&*.,;:\-_~`+=()\[\]{}|\\/<>?]/.test(val)) {
                    setConfig({ ...config, command_prefix: val || '!' })
                  }
                }}
                placeholder="!"
                className="max-w-[80px] glass-input text-slate-200"
                maxLength={1}
                disabled={isEnvControlled('command_prefix')}
              />
              <p className="text-xs text-slate-500">Single special character only (! $ % ^ & * . , ; : - _ ~ ` + = ( ) [ ] | \ /)</p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-400 flex items-center gap-2">
                Soundboard Upload Quota
                {isEnvControlled('soundboard_user_quota') && (
                  <span className="text-xs text-amber-400 flex items-center gap-1" title="Controlled by SOUNDBOARD_USER_QUOTA environment variable">
                    <Lock className="h-3 w-3" />
                    (env)
                  </span>
                )}
              </label>
              <Input
                type="number"
                min={1}
                max={100}
                value={config.soundboard_user_quota}
                onChange={(e) => setConfig({ ...config, soundboard_user_quota: Math.min(100, Math.max(1, parseInt(e.target.value) || 10)) })}
                className="max-w-[120px] glass-input text-slate-200"
                disabled={isEnvControlled('soundboard_user_quota')}
              />
              <p className="text-xs text-slate-500">Max personal soundboard files per user (1-100)</p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-400 flex items-center gap-2">
                Timezone
                {isEnvControlled('timezone') && (
                  <span className="text-xs text-amber-400 flex items-center gap-1" title="Controlled by TIMEZONE environment variable">
                    <Lock className="h-3 w-3" />
                    (env)
                  </span>
                )}
              </label>
              <select
                value={config.timezone}
                onChange={(e) => setConfig({ ...config, timezone: e.target.value })}
                className="flex h-10 w-full rounded-xl glass-input px-3 py-1 text-sm text-slate-200 outline-none focus:ring-2 focus:ring-primary/50"
                disabled={isEnvControlled('timezone')}
              >
                <option value="" className="bg-slate-800">System default</option>
                {timezones.map((tz) => (
                  <option key={tz} value={tz} className="bg-slate-800">
                    {tz}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Sources Tab */}
      {activeTab === 'sources' && (
        <div className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            <div className="glass-card rounded-2xl p-6 space-y-6 h-[380px]">
              <div>
                <h3 className="text-xl font-semibold text-slate-200 mb-1">TVheadend</h3>
                <p className="text-sm text-slate-400">TVheadend connection settings</p>
              </div>
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-400 flex items-center gap-2">
                    TVheadend URL
                    {isEnvControlled('tvheadend_url') && (
                      <span className="text-xs text-amber-400 flex items-center gap-1" title="Controlled by TVHEADEND_URL environment variable">
                        <Lock className="h-3 w-3" />
                        (env)
                      </span>
                    )}
                  </label>
                  <Input
                    value={config.tvheadend_url}
                    onChange={(e) => setConfig({ ...config, tvheadend_url: e.target.value })}
                    placeholder="http://192.168.1.100:9981"
                    className="glass-input text-slate-200"
                    disabled={isEnvControlled('tvheadend_url')}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-400 flex items-center gap-2">
                    TVheadend User
                    {isEnvControlled('tvheadend_user') && (
                      <span className="text-xs text-amber-400 flex items-center gap-1" title="Controlled by TVHEADEND_USER environment variable">
                        <Lock className="h-3 w-3" />
                        (env)
                      </span>
                    )}
                  </label>
                  <Input
                    value={config.tvheadend_user}
                    onChange={(e) => setConfig({ ...config, tvheadend_user: e.target.value })}
                    placeholder="admin"
                    className="glass-input text-slate-200"
                    disabled={isEnvControlled('tvheadend_user')}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-400 flex items-center gap-2">
                    TVheadend Password
                    {isEnvControlled('tvheadend_pass') && (
                      <span className="text-xs text-amber-400 flex items-center gap-1" title="Controlled by TVHEADEND_PASS environment variable">
                        <Lock className="h-3 w-3" />
                        (env)
                      </span>
                    )}
                  </label>
                  <div className="relative">
                    <Input
                      type={showTvPass ? 'text' : 'password'}
                      value={config.tvheadend_pass}
                      onChange={(e) => setConfig({ ...config, tvheadend_pass: e.target.value })}
                      placeholder="password"
                      className="pr-10 glass-input text-slate-200"
                      disabled={isEnvControlled('tvheadend_pass')}
                    />
                    <button
                      type="button"
                      onClick={() => setShowTvPass(!showTvPass)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 disabled:opacity-50"
                      disabled={isEnvControlled('tvheadend_pass')}
                    >
                      {showTvPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="glass-card rounded-2xl p-6 space-y-6 h-[380px]">
              <div>
                <h3 className="text-xl font-semibold text-slate-200 mb-1">Jellyfin</h3>
                <p className="text-sm text-slate-400">Jellyfin media server settings</p>
              </div>
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-400 flex items-center gap-2">
                    Jellyfin URL
                    {isEnvControlled('jellyfin_url') && (
                      <span className="text-xs text-amber-400 flex items-center gap-1" title="Controlled by JELLYFIN_URL environment variable">
                        <Lock className="h-3 w-3" />
                        (env)
                      </span>
                    )}
                  </label>
                  <Input
                    value={config.jellyfin_url}
                    onChange={(e) => setConfig({ ...config, jellyfin_url: e.target.value })}
                    placeholder="http://192.168.1.100:8096"
                    className="glass-input text-slate-200"
                    disabled={isEnvControlled('jellyfin_url')}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-400 flex items-center gap-2">
                    Jellyfin API Key
                    {isEnvControlled('jellyfin_api_key') && (
                      <span className="text-xs text-amber-400 flex items-center gap-1" title="Controlled by JELLYFIN_API_KEY environment variable">
                        <Lock className="h-3 w-3" />
                        (env)
                      </span>
                    )}
                  </label>
                  <div className="relative">
                    <Input
                      type={showJfKey ? 'text' : 'password'}
                      value={config.jellyfin_api_key}
                      onChange={(e) => setConfig({ ...config, jellyfin_api_key: e.target.value })}
                      placeholder="API key"
                      className="pr-10 glass-input text-slate-200"
                      disabled={isEnvControlled('jellyfin_api_key')}
                    />
                    <button
                      type="button"
                      onClick={() => setShowJfKey(!showJfKey)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 disabled:opacity-50"
                      disabled={isEnvControlled('jellyfin_api_key')}
                    >
                      {showJfKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              </div>
            </div>

          {/* IPTV Playlists */}
          <div
            className={`glass-card rounded-2xl p-6 space-y-4 transition-colors h-[380px] flex flex-col ${dragOver ? 'ring-2 ring-primary/40' : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleFileDrop}
          >
            <div className="flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-xl font-semibold text-slate-200 mb-1">IPTV Playlists</h3>
                <p className="text-sm text-slate-400">{iptvSources.length} source{iptvSources.length !== 1 ? 's' : ''} — drag & drop .m3u files here</p>
              </div>
              <Button onClick={openIptvModal} className="bg-primary/20 text-primary border border-primary/30 hover:bg-primary/30">
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            {addingSource && (
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                Processing…
              </div>
            )}

            <div className="space-y-2 overflow-y-auto min-h-0">
              {iptvSources.length === 0 ? (
                <div className="text-center py-8 border border-dashed border-white/10 rounded-xl">
                  <Upload className="h-8 w-8 text-slate-500 mx-auto mb-2" />
                  <p className="text-slate-400">No IPTV playlists added yet</p>
                  <p className="text-xs text-slate-500 mt-1">Drag & drop an .m3u file or click + to add a URL</p>
                </div>
              ) : (
                iptvSources.map((source) => (
                  <div
                    key={source.name}
                    className="flex items-center justify-between p-3 rounded-xl glass-light border-white/5"
                  >
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => handleToggleSource(source.name)}
                        className={`relative w-9 h-5 rounded-full transition-colors ${
                          source.enabled ? 'bg-primary' : 'bg-slate-600'
                        }`}
                      >
                        <span
                          className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                            source.enabled ? 'translate-x-4' : 'translate-x-0'
                          }`}
                        />
                      </button>
                      <div>
                        <p className="font-medium text-slate-200">{source.name}</p>
                        <p className="text-xs text-slate-400">{source.channel_count} channels</p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteSource(source.name)}
                      className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>

            {/* Local Sources */}
            <div className="glass-card rounded-2xl p-6 space-y-4 h-[380px] flex flex-col">
              <div className="shrink-0">
                <h3 className="text-xl font-semibold text-slate-200 mb-1">Local Sources</h3>
                <p className="text-sm text-slate-400">Local media directories</p>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto flex items-center justify-center">
                <p className="text-slate-500 text-sm">Coming soon</p>
              </div>
            </div>

            {/* Audio Settings */}
            <div className="glass-card rounded-2xl p-6 space-y-4 h-[380px] flex flex-col">
              <div className="shrink-0">
                <h3 className="text-xl font-semibold text-slate-200 mb-1">Audio</h3>
                <p className="text-sm text-slate-400">YouTube idle feed — genres &amp; playlists</p>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto space-y-4 pr-1">
                {/* Genres */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-400">Genres</label>
                  <div className="flex gap-2">
                    <Input
                      value={audioGenreInput}
                      onChange={(e) => setAudioGenreInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && addAudioGenre()}
                      placeholder="e.g. lo-fi, jazz"
                      className="glass-input text-slate-200 h-9 text-sm"
                    />
                    <Button onClick={addAudioGenre} className="bg-primary/20 text-primary border border-primary/30 hover:bg-primary/30 h-9 px-3 shrink-0">
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  {audioGenres.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {audioGenres.map(g => (
                        <span key={g} className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-primary/10 border border-primary/20 text-primary text-xs">
                          {g}
                          <button onClick={() => removeAudioGenre(g)} className="hover:text-red-400 transition-colors">&times;</button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                {/* Playlists */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-400">Playlist URLs</label>
                  <div className="flex gap-2">
                    <Input
                      value={audioPlaylistInput}
                      onChange={(e) => setAudioPlaylistInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && addAudioPlaylist()}
                      placeholder="https://youtube.com/playlist?list=…"
                      className="glass-input text-slate-200 h-9 text-sm"
                    />
                    <Button onClick={addAudioPlaylist} className="bg-primary/20 text-primary border border-primary/30 hover:bg-primary/30 h-9 px-3 shrink-0">
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  {audioPlaylists.length > 0 && (
                    <div className="space-y-1">
                      {audioPlaylists.map(p => (
                        <div key={p} className="flex items-center justify-between p-2 rounded-lg glass-light border-white/5 gap-2">
                          <span className="text-xs text-slate-300 truncate min-w-0">{p}</span>
                          <button onClick={() => removeAudioPlaylist(p)} className="text-red-400 hover:text-red-300 shrink-0 text-sm">&times;</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="shrink-0 pt-2">
                <Button onClick={handleSaveAudio} disabled={savingAudio} className="w-full bg-primary/20 text-primary border border-primary/30 hover:bg-primary/30">
                  {savingAudio ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
                </Button>
              </div>
            </div>
          </div>

          {/* Add Source Modal */}
          {showIptvModal && (
            <div
              className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
              onClick={() => setShowIptvModal(false)}
            >
              <div
                className="glass-card rounded-2xl p-6 w-full max-w-md space-y-4 m-4"
                onClick={(e) => e.stopPropagation()}
              >
                <h3 className="text-xl font-semibold text-slate-200">Add IPTV Source</h3>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-400">Source Name</label>
                  <Input
                    value={newSourceName}
                    onChange={(e) => {
                      setNewSourceName(e.target.value)
                      setSourceNameError('')
                    }}
                    placeholder="e.g., MyIPTV"
                    className="glass-input text-slate-200"
                  />
                  {sourceNameError && <p className="text-sm text-red-400">{sourceNameError}</p>}
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-400">M3U URL</label>
                  <Input
                    value={newSourceUrl}
                    onChange={(e) => {
                      setNewSourceUrl(e.target.value)
                      setSourceUrlError('')
                    }}
                    placeholder="http://example.com/playlist.m3u"
                    className="glass-input text-slate-200"
                  />
                  {sourceUrlError && <p className="text-sm text-red-400">{sourceUrlError}</p>}
                </div>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-white/10" />
                  </div>
                  <div className="relative flex justify-center">
                    <span className="bg-[#1e2b3a] px-3 text-xs text-slate-400">or</span>
                  </div>
                </div>

                <div
                  className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors ${
                    modalDragOver
                      ? 'border-primary/60 bg-primary/5'
                      : 'border-white/10 hover:border-white/20'
                  }`}
                  onDragOver={handleModalDragOver}
                  onDragLeave={handleModalDragLeave}
                  onDrop={handleModalFileDrop}
                >
                  <Upload className="h-8 w-8 text-slate-500 mx-auto mb-2" />
                  <p className="text-sm text-slate-400 mb-3">Drag & drop an .m3u or .m3u8 file here</p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".m3u,.m3u8"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) handleBrowseFile(file)
                      if (e.target) e.target.value = ''
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    className="glass-light border-white/10 text-slate-300 hover:bg-white/10"
                  >
                    Browse files
                  </Button>
                </div>

                <div className="flex gap-2 pt-2">
                  <Button
                    variant="outline"
                    onClick={() => setShowIptvModal(false)}
                    className="flex-1 glass-light border-white/10 text-slate-300 hover:bg-white/10"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleAddSource}
                    disabled={addingSource}
                    className="flex-1 bg-primary/20 text-primary border border-primary/30 hover:bg-primary/30"
                  >
                    {addingSource ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Streaming Tab */}
      {activeTab === 'streaming' && (
        <div className="glass-card rounded-2xl p-6 space-y-6">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-xl font-semibold text-slate-200 mb-1">Stream Quality</h3>
              <p className="text-sm text-slate-400">Configure video streaming output settings</p>
            </div>
            <div className="flex items-center gap-3">
              {botStatus !== null && (
                <span className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border ${
                  (botStatus.premium_type ?? 0) >= 2
                    ? 'bg-violet-500/20 text-violet-300 border-violet-500/30'
                    : (botStatus.premium_type ?? 0) >= 1
                    ? 'bg-blue-500/20 text-blue-300 border-blue-500/30'
                    : 'bg-slate-700/50 text-slate-400 border-slate-600/30'
                }`}>
                  <Zap className="h-3 w-3" />
                  {NITRO_LABELS[botStatus.premium_type ?? 0]}
                </span>
              )}
              {botStatus !== null && (
                <button
                  type="button"
                  onClick={() => {
                    const limits = NITRO_LIMITS[botStatus.premium_type ?? 0]
                    setConfig(prev => ({
                      ...prev,
                      stream_quality: limits.quality,
                      stream_fps: limits.fps,
                      stream_resolution: limits.resolution,
                      stream_video_bitrate: limits.bitrate,
                    }))
                  }}
                  className="text-xs text-primary hover:text-primary/80 underline underline-offset-2"
                >
                  Apply recommended
                </button>
              )}
            </div>
          </div>
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-400 flex items-center gap-2">
                  YT-DLP Format
                  {isEnvControlled('ytdlp_format') && (
                    <span className="text-xs text-amber-400 flex items-center gap-1" title="Controlled by YTDLP_FORMAT environment variable">
                      <Lock className="h-3 w-3" />
                      (env)
                    </span>
                  )}
                </label>
                <select
                  value={YTDLP_FORMATS.some(f => f.value === config.ytdlp_format) ? config.ytdlp_format : '__custom__'}
                  onChange={(e) => {
                    if (e.target.value !== '__custom__') setConfig({ ...config, ytdlp_format: e.target.value })
                  }}
                  className="flex h-10 w-full rounded-xl glass-input px-3 py-1 text-sm text-slate-200 outline-none focus:ring-2 focus:ring-primary/50"
                  disabled={isEnvControlled('ytdlp_format')}
                >
                  {YTDLP_FORMATS.map(f => (
                    <option key={f.value} value={f.value} className="bg-slate-800">{f.label}</option>
                  ))}
                  {!YTDLP_FORMATS.some(f => f.value === config.ytdlp_format) && (
                    <option value="__custom__" className="bg-slate-800">Custom: {config.ytdlp_format}</option>
                  )}
                </select>
                <p className="text-xs text-slate-500">
                  {YTDLP_FORMATS.find(f => f.value === config.ytdlp_format)?.description ?? 'Custom format selector'}
                </p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-400 flex items-center gap-2">
                  Quality Preset
                  {isEnvControlled('stream_quality') && (
                    <span className="text-xs text-amber-400 flex items-center gap-1" title="Controlled by STREAM_QUALITY environment variable">
                      <Lock className="h-3 w-3" />
                      (env)
                    </span>
                  )}
                </label>
                <select
                  value={config.stream_quality}
                  onChange={(e) => setConfig({ ...config, stream_quality: e.target.value })}
                  className="flex h-10 w-full rounded-xl glass-input px-3 py-1 text-sm text-slate-200 outline-none focus:ring-2 focus:ring-primary/50"
                  disabled={isEnvControlled('stream_quality')}
                >
                  <option value="720p" className="bg-slate-800">720p</option>
                  <option value="1080p" className="bg-slate-800">1080p</option>
                  <option value="4k" className="bg-slate-800">4K</option>
                </select>
                <p className="text-xs text-slate-500">Base resolution preset (Discord tier may limit this)</p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-400 flex items-center gap-2">
                  Resolution
                  {isEnvControlled('stream_resolution') && (
                    <span className="text-xs text-amber-400 flex items-center gap-1" title="Controlled by STREAM_RESOLUTION environment variable">
                      <Lock className="h-3 w-3" />
                      (env)
                    </span>
                  )}
                </label>
                <Input
                  value={config.stream_resolution}
                  onChange={(e) => setConfig({ ...config, stream_resolution: e.target.value })}
                  placeholder="1920:1080"
                  className="glass-input text-slate-200"
                  disabled={isEnvControlled('stream_resolution')}
                />
                <p className="text-xs text-slate-500">W:H format (overrides preset)</p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-400 flex items-center gap-2">
                  FPS
                  {isEnvControlled('stream_fps') && (
                    <span className="text-xs text-amber-400 flex items-center gap-1" title="Controlled by STREAM_FPS environment variable">
                      <Lock className="h-3 w-3" />
                      (env)
                    </span>
                  )}
                </label>
                <Input
                  type="number"
                  min={1}
                  max={60}
                  value={config.stream_fps}
                  onChange={(e) => setConfig({ ...config, stream_fps: Math.min(60, Math.max(1, parseInt(e.target.value) || 30)) })}
                  className="glass-input text-slate-200"
                  disabled={isEnvControlled('stream_fps')}
                />
                <p className="text-xs text-slate-500">1-60 frames per second</p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-400 flex items-center gap-2">
                  Video Bitrate
                  {isEnvControlled('stream_video_bitrate') && (
                    <span className="text-xs text-amber-400 flex items-center gap-1" title="Controlled by STREAM_VIDEO_BITRATE environment variable">
                      <Lock className="h-3 w-3" />
                      (env)
                    </span>
                  )}
                </label>
                <Input
                  value={config.stream_video_bitrate}
                  onChange={(e) => setConfig({ ...config, stream_video_bitrate: e.target.value })}
                  placeholder="6000k"
                  className="glass-input text-slate-200"
                  disabled={isEnvControlled('stream_video_bitrate')}
                />
                <p className="text-xs text-slate-500">CBR bitrate (e.g., 6000k)</p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-400 flex items-center gap-2">
                  Packet Pacing
                  {isEnvControlled('stream_packet_pace') && (
                    <span className="text-xs text-amber-400 flex items-center gap-1" title="Controlled by STREAM_PACKET_PACE environment variable">
                      <Lock className="h-3 w-3" />
                      (env)
                    </span>
                  )}
                </label>
                <div className="flex items-center gap-4">
                  <input
                    type="range"
                    min={0}
                    max={95}
                    value={Math.round(config.stream_packet_pace * 100)}
                    onChange={(e) => setConfig({ ...config, stream_packet_pace: parseInt(e.target.value) / 100 })}
                    className="flex-1 h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-primary disabled:opacity-50"
                    disabled={isEnvControlled('stream_packet_pace')}
                  />
                  <span className="text-sm text-slate-400 w-12 text-right">{Math.round(config.stream_packet_pace * 100)}%</span>
                </div>
                <p className="text-xs text-slate-500">Space RTP packets across frame interval (0 = off)</p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-400 flex items-center gap-2">
                  A/V Sync Offset (ms)
                  {isEnvControlled('stream_av_sync_ms') && (
                    <span className="text-xs text-amber-400 flex items-center gap-1" title="Controlled by STREAM_AV_SYNC_MS environment variable">
                      <Lock className="h-3 w-3" />
                      (env)
                    </span>
                  )}
                </label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={-5000}
                    max={5000}
                    value={config.stream_av_sync_ms}
                    onChange={(e) => setConfig({ ...config, stream_av_sync_ms: Math.min(5000, Math.max(-5000, parseInt(e.target.value) || 0)) })}
                    className="glass-input text-slate-200 max-w-[120px]"
                    disabled={isEnvControlled('stream_av_sync_ms')}
                  />
                  <span className="text-sm text-slate-400">ms</span>
                </div>
                <p className="text-xs text-slate-500">Positive = audio ahead, Negative = audio behind</p>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving} className="gap-2 bg-primary/20 text-primary border border-primary/30 hover:bg-primary/30">
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          Save Configuration
        </Button>
      </div>
    </div>
  )
}
