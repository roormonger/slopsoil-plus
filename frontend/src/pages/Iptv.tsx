import { useState, useEffect } from 'react'
import { Loader2, Trash2 } from 'lucide-react'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { useApi } from '../hooks/useApi'
import type { IptvSource } from '../types'

export function Iptv() {
  const api = useApi()
  const [sources, setSources] = useState<IptvSource[]>([])
  const [loading, setLoading] = useState(true)
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
      await loadSources()
      setLoading(false)
    }
    init()
  }, [])

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
    <div className="space-y-6">
      {/* Error/Success Messages */}
      {api.error && (
        <div className="p-4 glass-card border-red-400/30 text-red-300 rounded-xl">{api.error}</div>
      )}
      {api.success && (
        <div className="p-4 glass-card border-emerald-400/30 text-emerald-300 rounded-xl">{api.success}</div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold gradient-text mb-2">IPTV Sources</h2>
          <p className="text-slate-400">Manage M3U playlist sources for the !play command</p>
        </div>
        <Button onClick={openModal} className="bg-primary/20 text-primary border border-primary/30 hover:bg-primary/30">
          Add New
        </Button>
      </div>

      <div className="glass-card rounded-2xl overflow-hidden">
        <div className="divide-y divide-white/5">
          {sources.length === 0 ? (
            <div className="p-8 text-center text-slate-400">No IPTV sources configured</div>
          ) : (
            sources.map((source) => (
              <div key={source.name} className="flex items-center justify-between p-4 hover:bg-white/5 transition-colors">
                <div>
                  <p className="font-medium text-slate-200">{source.name}</p>
                  <p className="text-sm text-slate-400">{source.channel_count} channels</p>
                </div>
                <div className="flex items-center gap-3">
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
