import { useState, useEffect } from 'react'
import { Loader2, Eye, EyeOff, Lock } from 'lucide-react'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { useApi } from '../hooks/useApi'
import { timezones, type Config } from '../types'

export function Settings() {
  const api = useApi()
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

  const isEnvControlled = (key: keyof Config): boolean => {
    const result = settingsEnv[key as string]?.from_env ?? false
    if (key.includes('jellyfin')) {
      console.log(`isEnvControlled(${key}):`, result, 'settingsEnv[key]:', settingsEnv[key as string])
    }
    return result
  }

  useEffect(() => {
    const loadData = async () => {
      const data = await api.fetchConfig()
      console.log('API response data:', data)
      if (data) {
        setConfig(data.settings)
        setSettingsEnv(data.settingsEnv)
        console.log('settingsEnv set to:', data.settingsEnv)
        console.log('jellyfin_url from_env:', data.settingsEnv['jellyfin_url']?.from_env)
      }
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
      {/* Error/Success Messages */}
      {api.error && (
        <div className="p-4 glass-card border-red-400/30 text-red-300 rounded-xl">{api.error}</div>
      )}
      {api.success && (
        <div className="p-4 glass-card border-emerald-400/30 text-emerald-300 rounded-xl">{api.success}</div>
      )}

      <div className="mb-8">
        <h2 className="text-3xl font-bold gradient-text mb-2">Settings</h2>
        <p className="text-slate-400">Configure bot and media server connections</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* System Settings */}
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

        {/* IPTV Settings */}
        <div className="glass-card rounded-2xl p-6 space-y-6">
          <div>
            <h3 className="text-xl font-semibold text-slate-200 mb-1">IPTV</h3>
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

        {/* Streaming Settings */}
        <div className="glass-card rounded-2xl p-6 space-y-6 md:col-span-2">
          <div>
            <h3 className="text-xl font-semibold text-slate-200 mb-1">Streaming</h3>
            <p className="text-sm text-slate-400">Jellyfin media server settings</p>
          </div>
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
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
        </div>

        {/* Stream Quality Settings */}
        <div className="glass-card rounded-2xl p-6 space-y-6 md:col-span-2">
          <div>
            <h3 className="text-xl font-semibold text-slate-200 mb-1">Stream Quality</h3>
            <p className="text-sm text-slate-400">Configure video streaming output settings</p>
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
                <Input
                  value={config.ytdlp_format}
                  onChange={(e) => setConfig({ ...config, ytdlp_format: e.target.value })}
                  placeholder="bestvideo+bestaudio/best"
                  className="glass-input text-slate-200"
                  disabled={isEnvControlled('ytdlp_format')}
                />
                <p className="text-xs text-slate-500">Format selector for downloaded VODs</p>
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
