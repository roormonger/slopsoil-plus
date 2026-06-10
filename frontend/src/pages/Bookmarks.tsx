import { useState, useEffect } from 'react'
import { Loader2, Play, Trash2 } from 'lucide-react'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { useApi } from '../hooks/useApi'
import { useGuild } from '../contexts/GuildContext'
import type { Bookmark } from '../types'

export function Bookmarks() {
  const api = useApi()
  const { selectedGuild, selectedVoiceChannel } = useGuild()
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [newName, setNewName] = useState('')
  const [newUrl, setNewUrl] = useState('')
  const [nameError, setNameError] = useState('')
  const [urlError, setUrlError] = useState('')
  const [adding, setAdding] = useState(false)

  const loadBookmarks = async () => {
    const data = await api.fetchBookmarks()
    if (data) setBookmarks(data)
  }

  useEffect(() => {
    const init = async () => {
      await loadBookmarks()
      setLoading(false)
    }
    init()
  }, [])

  const handlePlay = async (url: string) => {
    if (!selectedGuild) {
      api.showMessage('Please select a guild from the top navigation first', 'error')
      return
    }
    if (!selectedVoiceChannel) {
      api.showMessage('Please select a voice channel from the top navigation first', 'error')
      return
    }
    await api.executeCommand(selectedGuild, 'play', url, selectedVoiceChannel)
  }

  const handleDelete = async (id: number) => {
    const success = await api.deleteBookmark(id)
    if (success) await loadBookmarks()
  }

  const handleAdd = async () => {
    // Validation
    let hasError = false
    if (!newName.trim()) {
      setNameError('Name is required')
      hasError = true
    } else {
      const existingNames = bookmarks.map((b) => b.name.toLowerCase())
      if (existingNames.includes(newName.trim().toLowerCase())) {
        setNameError('A bookmark with this name already exists')
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
    const success = await api.addBookmark(newName.trim(), newUrl.trim())
    if (success) {
      setShowModal(false)
      setNewName('')
      setNewUrl('')
      await loadBookmarks()
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

      <div className="flex items-center justify-between shrink-0">
        <div>
          <h2 className="text-3xl font-bold gradient-text mb-2">Bookmarks</h2>
          <p className="text-slate-400">Manage direct stream and URL bookmarks for the !play command</p>
        </div>
        <Button onClick={openModal} className="bg-primary/20 text-primary border border-primary/30 hover:bg-primary/30">
          Add New
        </Button>
      </div>

      <div className="glass-card rounded-2xl overflow-hidden flex-1 min-h-0">
        <div className="divide-y divide-white/5 h-full overflow-y-auto custom-scrollbar">
          {bookmarks.length === 0 ? (
            <div className="p-8 text-center text-slate-400">No bookmarks configured</div>
          ) : (
            bookmarks.map((bm) => (
              <div key={bm.id} className="flex items-center justify-between p-4 hover:bg-white/5 transition-colors">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-slate-200">{bm.name}</p>
                  <p className="text-sm text-slate-400 truncate">{bm.url}</p>
                </div>
                <div className="flex items-center gap-3 ml-4">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handlePlay(bm.url)}
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
                  <Button variant="ghost" size="sm" onClick={() => handleDelete(bm.id)} className="text-red-400 hover:text-red-300 hover:bg-red-500/10">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Add Bookmark Modal */}
      {showModal && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
          onClick={() => setShowModal(false)}
        >
          <div
            className="glass-card rounded-2xl p-6 w-full max-w-md space-y-4 m-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-xl font-semibold text-slate-200">Add Bookmark</h3>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-400">Bookmark Name</label>
              <Input
                value={newName}
                onChange={(e) => {
                  setNewName(e.target.value)
                  setNameError('')
                }}
                placeholder="e.g., YouTube Music"
                className="glass-input text-slate-200"
              />
              {nameError && <p className="text-sm text-red-400">{nameError}</p>}
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-400">URL</label>
              <Input
                value={newUrl}
                onChange={(e) => {
                  setNewUrl(e.target.value)
                  setUrlError('')
                }}
                placeholder="https://..."
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
