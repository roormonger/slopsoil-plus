import { useState, useEffect } from 'react'
import { Loader2, Trash2, Play, ArrowLeft, Star } from 'lucide-react'
import { LazyChannelImage } from '../components/LazyChannelImage'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { useApi } from '../hooks/useApi'
import { useAuth } from '../context/AuthContext'
import { useGuild } from '../contexts/GuildContext'
import type { IptvSource, IptvChannel } from '../types'

export function Iptv() {
  const api = useApi()
  const { user } = useAuth()
  const { selectedGuild, selectedVoiceChannel } = useGuild()
  const isAdmin = user?.role === 'admin'
  const [featuredIds, setFeaturedIds] = useState<Set<string>>(new Set())
  const [sources, setSources] = useState<IptvSource[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'list' | 'channels'>('list')
  const [selectedSource, setSelectedSource] = useState<string>('')
  const [channels, setChannels] = useState<IptvChannel[]>([])
  const [channelsLoading, setChannelsLoading] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [newName, setNewName] = useState('')
  const [newUrl, setNewUrl] = useState('')
  const [nameError, setNameError] = useState('')
  const [urlError, setUrlError] = useState('')
  const [adding, setAdding] = useState(false)

  const loadSources = async () => {
    const data = await api.fetchIptvSources()
    if (data) setSources(data)
  }

  useEffect(() => {
    const init = async () => {
      try {
        await loadSources()
        const featuredData = await api.fetchFeatured('iptv')
        if (featuredData) setFeaturedIds(new Set(featuredData.items.map(i => i.item_id)))
      } finally {
        setLoading(false)
      }
    }
    init()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleViewChannels = async (sourceName: string) => {
    setSelectedSource(sourceName)
    setChannelsLoading(true)
    setView('channels')
    const data = await api.fetchIptvChannels(sourceName)
    if (data) setChannels(data)
    setChannelsLoading(false)
  }

  const handleBack = () => {
    setView('list')
    setSelectedSource('')
    setChannels([])
  }

  const handleToggleFeatured = async (channelName: string) => {
    const result = await api.toggleFeatured('iptv', channelName)
    if (result !== null) {
      setFeaturedIds(prev => {
        const next = new Set(prev)
        if (result.featured) next.add(channelName)
        else next.delete(channelName)
        return next
      })
    }
  }

  const handlePlay = async (channelName: string) => {
    if (!selectedGuild) {
      api.showMessage('Please select a guild from the top navigation first', 'error')
      return
    }
    if (!selectedVoiceChannel) {
      api.showMessage('Please select a voice channel from the top navigation first', 'error')
      return
    }
    await api.executeCommand(selectedGuild, 'tv', channelName, selectedVoiceChannel)
  }

  const handleToggle = async (name: string, enabled: boolean) => {
    const success = await api.toggleIptvSource(name, !enabled)
    if (success) await loadSources()
  }

  const handleDelete = async (name: string) => {
    const success = await api.deleteIptvSource(name)
    if (success) await loadSources()
  }

  const handleAdd = async () => {
    // Validation
    let hasError = false
    if (!newName.trim()) {
      setNameError('Name is required')
      hasError = true
    } else {
      const existingNames = sources.map((s) => s.name.toLowerCase())
      if (existingNames.includes(newName.trim().toLowerCase())) {
        setNameError('A source with this name already exists')
        hasError = true
      }
    }
    if (!newUrl.trim()) {
      setUrlError('URL is required')
      hasError = true
    } else if (!newUrl.match(/^https?:\/\/.+/i)) {
      setUrlError('Please enter a valid HTTP or HTTPS URL')
      hasError = true
    }
    if (hasError) return

    setAdding(true)
    const success = await api.addIptvSource(newName.trim(), newUrl.trim())
    if (success) {
      setShowModal(false)
      setNewName('')
      setNewUrl('')
      await loadSources()
    }
    setAdding(false)
  }

  const openModal = () => {
    setShowModal(true)
    setNewName('')
    setNewUrl('')
    setNameError('')
    setUrlError('')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 h-[calc(100vh-8rem)]">
      {/* Error/Success Messages */}
      {api.error && (
        <div className="p-4 glass-card border-red-400/30 text-red-300 rounded-xl">{api.error}</div>
      )}
      {api.success && (
        <div className="p-4 glass-card border-emerald-400/30 text-emerald-300 rounded-xl">{api.success}</div>
      )}

      {view === 'list' ? (
        <>
          <div className="flex items-center justify-between shrink-0">
            <div>
              <h2 className="text-3xl font-bold gradient-text mb-2">IPTV Sources</h2>
              <p className="text-slate-400">Manage M3U playlist sources for the !play command</p>
            </div>
            <Button onClick={openModal} className="bg-primary/20 text-primary border border-primary/30 hover:bg-primary/30">
              Add New
            </Button>
          </div>

          <div className="glass-card rounded-2xl overflow-hidden flex-1 min-h-0">
            <div className="divide-y divide-white/5 h-full overflow-y-auto custom-scrollbar">
              {sources.length === 0 ? (
                <div className="p-8 text-center text-slate-400">No IPTV sources configured</div>
              ) : (
                sources.map((source) => (
                  <div
                    key={source.name}
                    className="flex items-center justify-between p-4 hover:bg-white/5 transition-colors cursor-pointer"
                    onClick={() => handleViewChannels(source.name)}
                  >
                    <div>
                      <p className="font-medium text-slate-200">{source.name}</p>
                      <p className="text-sm text-slate-400">{source.channel_count} channels</p>
                    </div>
                    <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                          type="checkbox"
                          checked={source.enabled}
                          onChange={() => handleToggle(source.name, source.enabled)}
                          className="rounded border-white/20 h-4 w-4 bg-transparent checked:bg-primary"
                        />
                        <span className={source.enabled ? 'text-emerald-400' : 'text-slate-400'}>
                          {source.enabled ? 'Enabled' : 'Disabled'}
                        </span>
                      </label>
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(source.name)} className="text-red-400 hover:text-red-300 hover:bg-red-500/10">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="flex items-center gap-3 shrink-0">
            <Button variant="ghost" size="sm" onClick={handleBack} className="text-slate-300 hover:text-white hover:bg-white/10">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
            <div>
              <h2 className="text-3xl font-bold gradient-text">{selectedSource}</h2>
              <p className="text-slate-400">{channels.length} channels</p>
            </div>
          </div>

          <div className="glass-card rounded-2xl overflow-hidden flex-1 min-h-0">
            <div className="divide-y divide-white/5 h-full overflow-y-auto custom-scrollbar">
              {channelsLoading ? (
                <div className="p-8 text-center text-slate-400">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                  Loading channels…
                </div>
              ) : channels.length === 0 ? (
                <div className="p-8 text-center text-slate-400">No channels found in this source</div>
              ) : (
                channels.map((ch, idx) => (
                  <div key={`${ch.name}-${idx}`} className="flex items-center justify-between p-3 hover:bg-white/5 transition-colors">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <LazyChannelImage src={ch.logo_url} alt={ch.name} className="w-10 h-10 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="font-medium text-slate-200 truncate">{ch.name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {ch.group && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-white/10 text-slate-300">
                              {ch.group}
                            </span>
                          )}
                          {ch.tvg_id && (
                            <span className="text-xs text-slate-500 truncate">{ch.tvg_id}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 ml-4">
                      {isAdmin && (
                        <button
                          onClick={() => handleToggleFeatured(ch.name)}
                          className={`p-1.5 rounded-lg transition-colors ${
                            featuredIds.has(ch.name)
                              ? 'text-yellow-400 hover:text-yellow-300 hover:bg-yellow-500/10'
                              : 'text-slate-500 hover:text-yellow-400 hover:bg-yellow-500/10'
                          }`}
                          title={featuredIds.has(ch.name) ? 'Remove from featured' : 'Add to featured'}
                        >
                          <Star className={`w-4 h-4 ${featuredIds.has(ch.name) ? 'fill-current' : ''}`} />
                        </button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handlePlay(ch.name)}
                        disabled={!selectedGuild || !selectedVoiceChannel}
                        className="text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10"
                        title={
                          !selectedGuild ? 'Select a guild first' :
                          !selectedVoiceChannel ? 'Select a voice channel first' :
                          'Play'
                        }
                      >
                        <Play className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}

      {/* Add Source Modal */}
      {showModal && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
          onClick={() => setShowModal(false)}
        >
          <div
            className="glass-card rounded-2xl p-6 w-full max-w-md space-y-4 m-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-xl font-semibold text-slate-200">Add IPTV Source</h3>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-400">Source Name</label>
              <Input
                value={newName}
                onChange={(e) => {
                  setNewName(e.target.value)
                  setNameError('')
                }}
                placeholder="e.g., MyIPTV"
                className="glass-input text-slate-200"
              />
              {nameError && <p className="text-sm text-red-400">{nameError}</p>}
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-400">M3U URL</label>
              <Input
                value={newUrl}
                onChange={(e) => {
                  setNewUrl(e.target.value)
                  setUrlError('')
                }}
                placeholder="http://example.com/playlist.m3u"
                className="glass-input text-slate-200"
              />
              {urlError && <p className="text-sm text-red-400">{urlError}</p>}
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowModal(false)} className="flex-1 glass-light border-white/10 text-slate-300 hover:bg-white/10">
                Cancel
              </Button>
              <Button onClick={handleAdd} disabled={adding} className="flex-1 bg-primary/20 text-primary border border-primary/30 hover:bg-primary/30">
                {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
