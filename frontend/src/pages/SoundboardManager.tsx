import { useState, useEffect, useRef, useCallback } from 'react'
import { Play, Pause, Trash2, Pencil, X, Save, Volume2, Clock, Loader2, CheckSquare, Square, Layers, ChevronDown, ImagePlus } from 'lucide-react'
import { Badge } from '../components/ui/badge'
import { useApi } from '../hooks/useApi'
import { useAuth } from '../context/AuthContext'
import type { Sound } from '../types'

interface UserOption { user_id: string; username: string }

// Unified edit state — null target = modal closed
interface EditTarget {
  sound: Sound | null        // null when bulk editing
  filenames: Set<string>     // always populated
}

export function SoundboardManager() {
  const api = useApi()
  const { user } = useAuth()
  const [sounds, setSounds] = useState<Sound[]>([])
  const [loading, setLoading] = useState(true)
  const [playingSound, setPlayingSound] = useState<string | null>(null)
  const [deletingSound, setDeletingSound] = useState<string | null>(null)
  const [selectedSounds, setSelectedSounds] = useState<Set<string>>(new Set())
  const [users, setUsers] = useState<UserOption[]>([])
  const [sourceUserId, setSourceUserId] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  // Unified edit modal
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null)
  const [editName, setEditName] = useState('')
  const [editTags, setEditTags] = useState('')
  const [editTagAction, setEditTagAction] = useState<'add' | 'replace'>('replace')
  const [editCoverFile, setEditCoverFile] = useState<File | null>(null)
  const [editCoverPreview, setEditCoverPreview] = useState<string | null>(null)
  const [coverDragOver, setCoverDragOver] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const coverInputRef = useRef<HTMLInputElement>(null)

  const isBulk = editTarget !== null && editTarget.sound === null
  const isSingleEdit = editTarget !== null && editTarget.sound !== null

  const isAdmin = user?.role === 'admin'

  useEffect(() => {
    api.fetchUsersWithSounds().then(data => {
      if (data) setUsers(data)
    })
  }, [])

  useEffect(() => {
    loadSounds()
    setSelectedSounds(new Set())
  }, [sourceUserId])

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }
    }
  }, [])

  const loadSounds = async () => {
    setLoading(true)
    const data = sourceUserId
      ? await api.fetchUserSounds(sourceUserId)
      : await api.fetchSystemSounds()
    if (data) setSounds(data)
    setLoading(false)
  }

  const handlePlay = (sound: Sound) => {
    if (playingSound === sound.filename) {
      if (audioRef.current) audioRef.current.pause()
      setPlayingSound(null)
    } else {
      if (audioRef.current) audioRef.current.pause()
      const audioUrl = sourceUserId
        ? api.getUserSoundAudioUrl(sourceUserId, sound.filename)
        : api.getSoundAudioUrl(sound.filename, 'system')
      audioRef.current = new Audio(audioUrl)
      audioRef.current.onended = () => setPlayingSound(null)
      audioRef.current.play()
      setPlayingSound(sound.filename)
    }
  }

  const handleDelete = async (sound: Sound) => {
    if (!confirm(`Delete "${sound.name}"? This cannot be undone.`)) return
    setDeletingSound(sound.filename)
    const ok = sourceUserId
      ? await api.deleteUserSound(sourceUserId, sound.filename)
      : await api.deleteSystemSound(sound.filename)
    if (ok) setSounds(sounds.filter(s => s.filename !== sound.filename))
    setDeletingSound(null)
  }

  // ── Edit modal helpers ──────────────────────────────────────────────────────

  const openSingleEdit = (sound: Sound) => {
    setEditTarget({ sound, filenames: new Set([sound.filename]) })
    setEditName(sound.name)
    setEditTags(sound.tags.join(', '))
    setEditTagAction('replace')
    setEditCoverFile(null)
    setEditCoverPreview(null)
  }

  const openBulkEdit = () => {
    if (selectedSounds.size === 0) return
    setEditTarget({ sound: null, filenames: new Set(selectedSounds) })
    setEditName('')
    setEditTags('')
    setEditTagAction('add')
    setEditCoverFile(null)
    setEditCoverPreview(null)
  }

  const closeEdit = () => {
    setEditTarget(null)
    setEditCoverFile(null)
    setEditCoverPreview(null)
  }

  const handleCoverFileSelected = (file: File) => {
    if (!file.type.startsWith('image/')) return
    setEditCoverFile(file)
    setEditCoverPreview(URL.createObjectURL(file))
  }

  const handleCoverDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setCoverDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleCoverFileSelected(file)
  }, [])

  const handleSaveEdit = async () => {
    if (!editTarget) return
    setIsSaving(true)

    const filenames = Array.from(editTarget.filenames)
    const isMulti = filenames.length > 1

    for (const filename of filenames) {
      const sound = sounds.find(s => s.filename === filename)
      if (!sound) continue
      let current = { ...sound }

      // Rename (single only)
      if (!isMulti && editName.trim() && editName.trim() !== sound.name) {
        const renamed = sourceUserId
          ? await api.renameUserSound(sourceUserId, current.filename, editName.trim())
          : await api.renameSystemSound(current.filename, editName.trim())
        if (renamed) current = renamed
      }

      // Tags
      const newTags = editTags.split(',').map(t => t.trim().toLowerCase()).filter(t => t)
      if (newTags.length > 0) {
        const finalTags = editTagAction === 'add'
          ? [...new Set([...current.tags, ...newTags])]
          : newTags
        const result = sourceUserId
          ? await api.updateUserSoundTags(sourceUserId, current.filename, finalTags)
          : await api.updateSoundTags(current.filename, 'system', finalTags)
        if (result) current = { ...current, tags: result }
      }

      // Cover
      if (editCoverFile) {
        const ok = sourceUserId
          ? await api.updateUserSoundCover(sourceUserId, current.filename, editCoverFile)
          : await api.updateSystemSoundCover(current.filename, editCoverFile)
        if (ok) current = { ...current, has_cover_art: true }
      }

      setSounds(prev => prev.map(s => s.filename === sound.filename ? current : s))
    }

    setIsSaving(false)
    closeEdit()
    if (isMulti) setSelectedSounds(new Set())
  }

  // ── Multiselect ──────────────────────────────────────────────────────────────

  const toggleSelection = (filename: string) => {
    const newSelected = new Set(selectedSounds)
    if (newSelected.has(filename)) {
      newSelected.delete(filename)
    } else {
      newSelected.add(filename)
    }
    setSelectedSounds(newSelected)
  }

  const selectAll = () => setSelectedSounds(new Set(sounds.map(s => s.filename)))
  const clearSelection = () => setSelectedSounds(new Set())

  const getCoverUrl = (filename: string) => {
    if (sourceUserId) return api.getUserSoundCoverUrl(sourceUserId, filename)
    const token = localStorage.getItem('slopsoil_token') || ''
    const base = `/api/soundboard/system/${encodeURIComponent(filename)}/cover`
    return token ? `${base}?token=${token}` : base
  }

  const formatDuration = (seconds?: number) => {
    if (!seconds) return ''
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="glass-card rounded-2xl p-12 text-center">
            <h2 className="text-2xl font-bold text-slate-200 mb-4">Access Denied</h2>
            <p className="text-slate-400">Only administrators can manage soundboard clips.</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="glass-card rounded-2xl p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-slate-200 flex items-center gap-3">
                <Volume2 className="w-7 h-7 text-primary" />
                Soundboard Manager
              </h2>
              <p className="text-slate-400 mt-1">Manage system sound clips, tags, and playback</p>
            </div>
          </div>
          <div className="flex items-center gap-3 mt-4 pt-4 border-t border-white/10 flex-wrap">
            {/* Source dropdown */}
            <div className="relative">
              <select
                value={sourceUserId ?? 'system'}
                onChange={e => setSourceUserId(e.target.value === 'system' ? null : e.target.value)}
                className="appearance-none pl-3 pr-8 py-1.5 rounded-lg bg-slate-700/50 border border-white/10 text-slate-200 text-sm focus:border-primary focus:outline-none cursor-pointer"
              >
                <option value="system">System</option>
                {users.map(u => (
                  <option key={u.user_id} value={u.user_id}>{u.username}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
            </div>

            <div className="w-px h-5 bg-white/10" />

            {sounds.length > 0 && (
              <>
                <button
                  onClick={selectAll}
                  className="flex items-center gap-2 text-sm text-slate-400 hover:text-slate-200 transition-colors"
                >
                  <CheckSquare className="w-4 h-4" />
                  Select All
                </button>
                {selectedSounds.size > 0 && (
                  <button
                    onClick={clearSelection}
                    className="flex items-center gap-2 text-sm text-slate-400 hover:text-slate-200 transition-colors"
                  >
                    <Square className="w-4 h-4" />
                    Clear Selection
                  </button>
                )}
              </>
            )}

            {/* Selection controls — pushed to right */}
            <div className="ml-auto flex items-center gap-3">
              {selectedSounds.size > 0 && (
                <>
                  <Badge className="bg-primary/20 text-primary border-0 px-3 py-1">
                    {selectedSounds.size} selected
                  </Badge>
                  <button
                    onClick={openBulkEdit}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary/80 hover:bg-primary text-white text-sm transition-colors"
                    title="Bulk edit tags"
                  >
                    <Layers className="w-4 h-4" />
                    Bulk Edit
                  </button>
                  <button
                    onClick={clearSelection}
                    className="p-2 rounded-lg bg-slate-700/50 hover:bg-slate-700 text-slate-300 transition-colors"
                    title="Clear selection"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </>
              )}
              <Badge className="glass-light border-white/10 text-slate-300 px-3 py-1">
                {sounds.length} clips
              </Badge>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="glass-card rounded-2xl p-12 text-center">
            <Loader2 className="w-8 h-8 text-slate-400 animate-spin mx-auto" />
            <p className="text-slate-400 mt-4">Loading sounds...</p>
          </div>
        ) : sounds.length === 0 ? (
          <div className="glass-card rounded-2xl p-12 text-center">
            <Volume2 className="w-12 h-12 text-slate-600 mx-auto mb-4" />
            <p className="text-slate-400">No sound clips found. Upload some first!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sounds.map((sound) => (
              <div key={sound.filename} className={`glass-card rounded-xl p-4 flex gap-3 transition-all ${selectedSounds.has(sound.filename) ? 'ring-2 ring-primary/50 bg-primary/5' : ''}`}>
                {/* Cover art */}
                <div className="shrink-0 w-14 h-14 rounded-lg overflow-hidden bg-slate-700/50 flex items-center justify-center">
                  {sound.has_cover_art ? (
                    <img
                      src={getCoverUrl(sound.filename)}
                      alt=""
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none'
                        const fallback = e.currentTarget.nextElementSibling as HTMLElement | null
                        if (fallback) fallback.style.display = 'flex'
                      }}
                    />
                  ) : null}
                  <div className={`w-full h-full items-center justify-center ${sound.has_cover_art ? 'hidden' : 'flex'}`}>
                    <Volume2 className="w-6 h-6 text-slate-500" />
                  </div>
                </div>

                {/* Right side */}
                <div className="flex-1 min-w-0 flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="font-semibold text-slate-200 truncate" title={sound.name}>
                        {sound.name}
                      </h3>
                      {sound.duration && (
                        <div className="flex items-center gap-1 text-xs text-slate-400 mt-0.5">
                          <Clock className="w-3 h-3" />
                          {formatDuration(sound.duration)}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => toggleSelection(sound.filename)}
                      className={`shrink-0 p-1.5 rounded transition-colors ${selectedSounds.has(sound.filename) ? 'bg-primary text-white' : 'bg-slate-700/50 text-slate-400 hover:text-slate-200'}`}
                      title={selectedSounds.has(sound.filename) ? 'Deselect' : 'Select'}
                    >
                      {selectedSounds.has(sound.filename) ? (
                        <CheckSquare className="w-4 h-4" />
                      ) : (
                        <Square className="w-4 h-4" />
                      )}
                    </button>
                  </div>

                  {/* Tags */}
                  <div className="flex flex-wrap gap-1 min-h-[20px]">
                    {sound.tags.length > 0 ? (
                      sound.tags.map((tag) => (
                        <Badge
                          key={tag}
                          className="bg-primary/20 text-primary border-0 text-xs px-2 py-0.5"
                        >
                          {tag}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-xs text-slate-500 italic">No tags</span>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handlePlay(sound)}
                      className={`p-2 rounded-lg transition-colors ${
                        playingSound === sound.filename
                          ? 'bg-primary/30 text-primary'
                          : 'bg-slate-700/50 hover:bg-slate-700 text-slate-300'
                      }`}
                      title={playingSound === sound.filename ? 'Pause' : 'Play'}
                    >
                      {playingSound === sound.filename ? (
                        <Pause className="w-4 h-4" />
                      ) : (
                        <Play className="w-4 h-4" />
                      )}
                    </button>

                    <button
                      onClick={() => openSingleEdit(sound)}
                      className="p-2 rounded-lg bg-slate-700/50 hover:bg-slate-700 text-slate-300 transition-colors"
                      title="Edit"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>

                    <button
                      onClick={() => handleDelete(sound)}
                      disabled={deletingSound === sound.filename}
                      className="p-2 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-400 transition-colors disabled:opacity-50"
                      title="Delete"
                    >
                      {deletingSound === sound.filename ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Unified Edit Modal */}
        {editTarget && (
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={closeEdit}
          >
            <div className="glass-card rounded-2xl p-6 max-w-md w-full space-y-5" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-semibold text-slate-200">
                  {isBulk ? `Edit ${editTarget.filenames.size} Clips` : 'Edit Sound'}
                </h3>
                <button onClick={closeEdit} className="p-1 rounded-lg hover:bg-slate-700/50 text-slate-400">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Name — single edit only */}
              {isSingleEdit && (
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Name</label>
                  <input
                    type="text"
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    autoFocus
                    className="w-full px-4 py-2 rounded-lg bg-slate-800/50 border border-white/10 text-slate-200 placeholder-slate-500 focus:border-primary focus:outline-none"
                  />
                </div>
              )}

              {/* Tags */}
              <div>
                <label className="block text-sm text-slate-400 mb-1">Tags (comma separated)</label>
                <div className="flex gap-2 mb-2">
                  <button
                    onClick={() => setEditTagAction('add')}
                    className={`flex-1 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                      editTagAction === 'add'
                        ? 'bg-primary/20 text-primary border border-primary/30'
                        : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    Add to existing
                  </button>
                  <button
                    onClick={() => setEditTagAction('replace')}
                    className={`flex-1 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                      editTagAction === 'replace'
                        ? 'bg-primary/20 text-primary border border-primary/30'
                        : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    Replace all
                  </button>
                </div>
                <input
                  type="text"
                  value={editTags}
                  onChange={e => setEditTags(e.target.value)}
                  placeholder="funny, meme, notification"
                  className="w-full px-4 py-2 rounded-lg bg-slate-800/50 border border-white/10 text-slate-200 placeholder-slate-500 focus:border-primary focus:outline-none"
                />
                <p className="text-xs text-slate-500 mt-1">
                  {editTagAction === 'add' ? 'Tags will be merged with existing' : 'Tags will replace all existing tags'}
                  {isBulk ? ' on all selected clips' : ''}
                </p>
              </div>

              {/* Cover art */}
              <div>
                <label className="block text-sm text-slate-400 mb-1">Cover Art</label>
                <div
                  onDragOver={e => { e.preventDefault(); setCoverDragOver(true) }}
                  onDragLeave={() => setCoverDragOver(false)}
                  onDrop={handleCoverDrop}
                  onClick={() => coverInputRef.current?.click()}
                  className={`relative flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed cursor-pointer transition-colors h-32 ${
                    coverDragOver
                      ? 'border-primary bg-primary/10'
                      : 'border-white/10 hover:border-primary/50 hover:bg-white/5'
                  }`}
                >
                  {editCoverPreview ? (
                    <img src={editCoverPreview} alt="Preview" className="h-full w-full object-cover rounded-xl" />
                  ) : (isSingleEdit && editTarget.sound?.has_cover_art) ? (
                    <img
                      src={getCoverUrl(editTarget.sound.filename)}
                      alt="Current cover"
                      className="h-full w-full object-cover rounded-xl"
                      onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                    />
                  ) : (
                    <>
                      <ImagePlus className="w-7 h-7 text-slate-500" />
                      <span className="text-sm text-slate-500">Drag & drop or click to choose image</span>
                    </>
                  )}
                  {(editCoverPreview || (isSingleEdit && editTarget.sound?.has_cover_art)) && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 hover:opacity-100 rounded-xl transition-opacity">
                      <span className="text-sm text-white">Change cover</span>
                    </div>
                  )}
                </div>
                <input
                  ref={coverInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={e => {
                    const f = e.target.files?.[0]
                    if (f) handleCoverFileSelected(f)
                    e.target.value = ''
                  }}
                />
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button
                  onClick={closeEdit}
                  className="px-4 py-2 rounded-lg bg-slate-700/50 hover:bg-slate-700 text-slate-300 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveEdit}
                  disabled={isSaving}
                  className="px-4 py-2 rounded-lg bg-primary/80 hover:bg-primary text-white flex items-center gap-2 transition-colors disabled:opacity-50"
                >
                  {isSaving ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  {isBulk ? `Save to ${editTarget.filenames.size} clip${editTarget.filenames.size === 1 ? '' : 's'}` : 'Save'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
