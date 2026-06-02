import { useState, useEffect } from 'react'
import { Loader2, Eye, EyeOff } from 'lucide-react'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { useApi } from '../hooks/useApi'
import { timezones, type Config } from '../types'

export function Settings() {
  const api = useApi()
  const [config, setConfig] = useState<Config>({
    discord_token: '',
    command_prefix: '!',
    tvheadend_url: '',
    tvheadend_user: '',
    tvheadend_pass: '',
    jellyfin_url: '',
    jellyfin_api_key: '',
    timezone: '',
  })
  const [showToken, setShowToken] = useState(false)
  const [showTvPass, setShowTvPass] = useState(false)
  const [showJfKey, setShowJfKey] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadData = async () => {
      const data = await api.fetchConfig()
      if (data) {
        setConfig(data.settings)
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
              <label className="text-sm font-medium text-slate-400">Discord Bot Token</label>
              <div className="relative">
                <Input
                  type={showToken ? 'text' : 'password'}
                  value={config.discord_token}
                  onChange={(e) => setConfig({ ...config, discord_token: e.target.value })}
                  placeholder="Enter Discord bot token"
                  className="pr-10 glass-input text-slate-200"
                />
                <button
                  type="button"
                  onClick={() => setShowToken(!showToken)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                >
                  {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-400">Command Prefix</label>
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
              />
              <p className="text-xs text-slate-500">Single special character only (! $ % ^ & * . , ; : - _ ~ ` + = ( ) [ ] | \ /)</p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-400">Timezone</label>
              <select
                value={config.timezone}
                onChange={(e) => setConfig({ ...config, timezone: e.target.value })}
                className="flex h-10 w-full rounded-xl glass-input px-3 py-1 text-sm text-slate-200 outline-none focus:ring-2 focus:ring-primary/50"
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
              <label className="text-sm font-medium text-slate-400">TVheadend URL</label>
              <Input
                value={config.tvheadend_url}
                onChange={(e) => setConfig({ ...config, tvheadend_url: e.target.value })}
                placeholder="http://192.168.1.100:9981"
                className="glass-input text-slate-200"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-400">TVheadend User</label>
              <Input
                value={config.tvheadend_user}
                onChange={(e) => setConfig({ ...config, tvheadend_user: e.target.value })}
                placeholder="admin"
                className="glass-input text-slate-200"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-400">TVheadend Password</label>
              <div className="relative">
                <Input
                  type={showTvPass ? 'text' : 'password'}
                  value={config.tvheadend_pass}
                  onChange={(e) => setConfig({ ...config, tvheadend_pass: e.target.value })}
                  placeholder="password"
                  className="pr-10 glass-input text-slate-200"
                />
                <button
                  type="button"
                  onClick={() => setShowTvPass(!showTvPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
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
                <label className="text-sm font-medium text-slate-400">Jellyfin URL</label>
                <Input
                  value={config.jellyfin_url}
                  onChange={(e) => setConfig({ ...config, jellyfin_url: e.target.value })}
                  placeholder="http://192.168.1.100:8096"
                  className="glass-input text-slate-200"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-400">Jellyfin API Key</label>
                <div className="relative">
                  <Input
                    type={showJfKey ? 'text' : 'password'}
                    value={config.jellyfin_api_key}
                    onChange={(e) => setConfig({ ...config, jellyfin_api_key: e.target.value })}
                    placeholder="API key"
                    className="pr-10 glass-input text-slate-200"
                  />
                  <button
                    type="button"
                    onClick={() => setShowJfKey(!showJfKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                  >
                    {showJfKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
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
