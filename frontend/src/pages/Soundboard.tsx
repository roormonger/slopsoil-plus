import { useState, useEffect, useRef } from 'react'
import { Volume2, Play, Trash2, Upload, AlertCircle } from 'lucide-react'
import { Button } from '../components/ui/button'
import { useApi } from '../hooks/useApi'
import { useAuth } from '../context/AuthContext'
import { useGuild } from '../contexts/GuildContext'
import type { Sound } from '../types'

type Tab = 'system' | 'personal'

export function Soundboard() {
  const api = useApi()
  const { user } = useAuth()
  const { selectedGuild, selectedVoiceChannel } = useGuild()
  const [activeTab, setActiveTab] = useState<Tab>('system')
  const [systemSounds, setSystemSounds] = useState<Sound[]>([])
  const [personalSounds, setPersonalSounds] = useState<Sound[]>([])
  const [quota, setQuota] = useState(10)
  const [loading, setLoading] = useState(true)
  const systemInputRef = useRef<HTMLInputElement>(null)
  const personalInputRef = useRef<HTMLInputElement>(null)
  const isAdmin = user?.role === 'admin'

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const [system, personal, config] = await Promise.all([
        api.fetchSystemSounds(),
        api.fetchMySounds(),
        api.fetchConfig(),
      ])
      if (system) setSystemSounds(system)
      if (personal) setPersonalSounds(personal)
      if (config?.settings?.soundboard_user_quota) {
        setQuota(Number(config.settings.soundboard_user_quota) || 10)
      }
      setLoading(false)
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleUpload = async (file: File, type: 'system' | 'personal') => {
    const ok = type === 'system'
      ? await api.uploadSystemSound(file)
      : await api.uploadPersonalSound(file)
    if (ok) {
      if (type === 'system') {
        const sounds = await api.fetchSystemSounds()
        if (sounds) setSystemSounds(sounds)
      } else {
        const sounds = await api.fetchMySounds()
        if (sounds) setPersonalSounds(sounds)
      }
    }
  }

  const handleDelete = async (filename: string, type: 'system' | 'personal') => {
    const ok = type === 'system'
      ? await api.deleteSystemSound(filename)
      : await api.deletePersonalSound(filename)
    if (ok) {
      if (type === 'system') setSystemSounds(prev => prev.filter(s => s.filename !== filename))
      else setPersonalSounds(prev => prev.filter(s => s.filename !== filename))
    }
  }

  const handlePlay = async (filename: string, type: 'system' | 'personal') => {
    if (!selectedGuild) {
      api.showMessage('Please select a guild from the top navigation first', 'error')
      return
    }
    if (!selectedVoiceChannel) {
      api.showMessage('Please select a voice channel from the top navigation first', 'error')
      return
    }
    await api.playSound(filename, type, selectedGuild, selectedVoiceChannel)
  }

  const renderSoundGrid = (sounds: Sound[], type: 'system' | 'personal') => {
    if (sounds.length === 0) {
      return (
        <div className="text-center py-12 text-slate-500">
          <Volume2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>No sounds yet.</p>
          {type === 'system' && isAdmin && <p className="text-sm mt-1">Upload system sounds for everyone to use.</p>}
          {type === 'personal' && <p className="text-sm mt-1">Upload your own personal sounds.</p>}
        </div>
      )
    }

    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {sounds.map(sound => (
          <div
            key={sound.filename}
            className="glass-card rounded-xl p-4 flex flex-col items-center gap-3 hover:bg-white/5 transition-colors"
          >
            <div className="w-12 h-12 rounded-full glass-light flex items-center justify-center">
              <Volume2 className="w-5 h-5 text-primary" />
            </div>
            <span className="text-sm font-medium text-slate-200 text-center truncate w-full" title={sound.name}>
              {sound.name}
            </span>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="ghost"
                className="h-8 w-8 p-0 rounded-full bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300"
                onClick={() => handlePlay(sound.filename, type)}
                disabled={!selectedGuild || !selectedVoiceChannel}
                title={
                  !selectedGuild ? 'Select a guild first' :
                  !selectedVoiceChannel ? 'Select a voice channel first' :
                  'Play'
                }
              >
                <Play className="w-4 h-4" />
              </Button>
              {(type === 'system' ? isAdmin : true) && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 w-8 p-0 rounded-full bg-red-500/20 hover:bg-red-500/30 text-red-300"
                  onClick={() => handleDelete(sound.filename, type)}
                  title="Delete"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="mb-8">
        <h2 className="text-3xl font-bold gradient-text mb-2">Soundboard</h2>
        <p className="text-slate-400">Play sound clips in Discord voice channels</p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={() => setActiveTab('system')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'system'
              ? 'bg-primary/20 text-primary border border-primary/30'
              : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
          }`}
        >
          System
        </button>
        <button
          onClick={() => setActiveTab('personal')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'personal'
              ? 'bg-primary/20 text-primary border border-primary/30'
              : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
          }`}
        >
          My Soundboard
        </button>
      </div>

      {loading && (
        <div className="text-center py-12 text-slate-500">
          <Volume2 className="w-8 h-8 mx-auto mb-2 animate-pulse opacity-50" />
          <p>Loading sounds...</p>
        </div>
      )}

      {!loading && activeTab === 'system' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-slate-200">System Sounds</h3>
            {isAdmin && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-2 border-white/10 text-slate-300 hover:bg-white/5"
                  onClick={() => systemInputRef.current?.click()}
                >
                  <Upload className="w-4 h-4" />
                  Upload
                </Button>
                <input
                  ref={systemInputRef}
                  type="file"
                  accept="audio/*"
                  className="hidden"
                  onChange={e => {
                    const file = e.target.files?.[0]
                    if (file) handleUpload(file, 'system')
                    e.target.value = ''
                  }}
                />
              </>
            )}
          </div>
          {renderSoundGrid(systemSounds, 'system')}
        </div>
      )}

      {!loading && activeTab === 'personal' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-slate-200">My Soundboard</h3>
              <p className="text-sm text-slate-500">
                {personalSounds.length} / {quota} sounds
              </p>
            </div>
            <>
              <Button
                size="sm"
                variant="outline"
                className="gap-2 border-white/10 text-slate-300 hover:bg-white/5"
                onClick={() => personalInputRef.current?.click()}
                disabled={personalSounds.length >= quota}
              >
                <Upload className="w-4 h-4" />
                Upload
              </Button>
              <input
                ref={personalInputRef}
                type="file"
                accept="audio/*"
                className="hidden"
                onChange={e => {
                  const file = e.target.files?.[0]
                  if (file) handleUpload(file, 'personal')
                  e.target.value = ''
                }}
              />
            </>
          </div>
          {personalSounds.length >= quota && (
            <div className="flex items-center gap-2 text-amber-400 text-sm">
              <AlertCircle className="w-4 h-4" />
              Upload quota reached. Delete a sound to upload more.
            </div>
          )}
          {renderSoundGrid(personalSounds, 'personal')}
        </div>
      )}
    </div>
  )
}
