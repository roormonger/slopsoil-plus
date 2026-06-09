import { useState, useEffect, useRef, useCallback } from 'react'
import { Volume2, Trash2, Upload, AlertCircle, Search, Plus, X, MoreVertical, Pencil, ImagePlus } from 'lucide-react'
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
  const [searchQuery, setSearchQuery] = useState('')
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [uploadTags, setUploadTags] = useState('')
  const [uploadingFile, setUploadingFile] = useState<File | null>(null)
  const personalInputRef = useRef<HTMLInputElement>(null)
  const isAdmin = user?.role === 'admin'

  // Edit modal state
  const [editingSound, setEditingSound] = useState<Sound | null>(null)
  const [editName, setEditName] = useState('')
  const [editTags, setEditTags] = useState('')
  const [editCoverFile, setEditCoverFile] = useState<File | null>(null)
  const [editCoverPreview, setEditCoverPreview] = useState<string | null>(null)
  const [editSaving, setEditSaving] = useState(false)
  const [coverDragOver, setCoverDragOver] = useState(false)
  const [openMenuFilename, setOpenMenuFilename] = useState<string | null>(null)
  const coverInputRef = useRef<HTMLInputElement>(null)

  // Filter sounds by search query (matches name or tags)
  const filterSounds = (sounds: Sound[], query: string): Sound[] => {
    if (!query.trim()) return sounds
    const q = query.toLowerCase()
    return sounds.filter(s =>
      s.name.toLowerCase().includes(q) ||
      s.tags.some(tag => tag.toLowerCase().includes(q))
    )
  }

  const filteredSystemSounds = filterSounds(systemSounds, searchQuery)
  const filteredPersonalSounds = filterSounds(personalSounds, searchQuery)

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

  const handleUpload = async (file: File, type: 'system' | 'personal', tags?: string) => {
    const ok = type === 'system'
      ? await api.uploadSystemSound(file)
      : await api.uploadPersonalSound(file)
    if (ok) {
      // Apply tags if provided for personal uploads
      if (tags && type === 'personal') {
        const tagList = tags.split(',').map(t => t.trim().toLowerCase()).filter(t => t)
        if (tagList.length > 0) {
          await api.updateSoundTags(file.name, 'personal', tagList)
        }
      }
      if (type === 'system') {
        const sounds = await api.fetchSystemSounds()
        if (sounds) setSystemSounds(sounds)
      } else {
        const sounds = await api.fetchMySounds()
        if (sounds) setPersonalSounds(sounds)
      }
    }
  }

  const openEditModal = (sound: Sound) => {
    setEditingSound(sound)
    setEditName(sound.name)
    setEditTags(sound.tags.join(', '))
    setEditCoverFile(null)
    setEditCoverPreview(null)
    setOpenMenuFilename(null)
  }

  const closeEditModal = () => {
    setEditingSound(null)
    setEditCoverPreview(null)
    setEditCoverFile(null)
  }

  const handleCoverFileSelected = (file: File) => {
    if (!file.type.startsWith('image/')) return
    setEditCoverFile(file)
    const url = URL.createObjectURL(file)
    setEditCoverPreview(url)
  }

  const handleCoverDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setCoverDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleCoverFileSelected(file)
  }, [])

  const handleSaveEdit = async () => {
    if (!editingSound) return
    setEditSaving(true)
    let updatedSound = { ...editingSound }

    // 1. Rename if name changed
    const newName = editName.trim()
    if (newName && newName !== editingSound.name) {
      const renamed = await api.renamePersonalSound(editingSound.filename, newName)
      if (renamed) updatedSound = renamed
    }

    // 2. Update tags
    const newTags = editTags.split(',').map(t => t.trim().toLowerCase()).filter(t => t)
    const tagsChanged = JSON.stringify(newTags) !== JSON.stringify(editingSound.tags)
    if (tagsChanged) {
      const result = await api.updateSoundTags(updatedSound.filename, 'personal', newTags)
      if (result) updatedSound = { ...updatedSound, tags: result }
    }

    // 3. Upload cover if provided
    if (editCoverFile) {
      const ok = await api.updatePersonalSoundCover(updatedSound.filename, editCoverFile)
      if (ok) updatedSound = { ...updatedSound, has_cover_art: true }
    }

    setPersonalSounds(prev => prev.map(s => s.filename === editingSound.filename ? updatedSound : s))
    setEditSaving(false)
    closeEditModal()
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

  const getToken = () => localStorage.getItem('slopsoil_token') || ''

  const getCoverUrl = (filename: string, type: 'system' | 'personal') => {
    const token = getToken()
    const base = type === 'system' ? `/api/soundboard/system/${encodeURIComponent(filename)}/cover` : `/api/soundboard/mine/${encodeURIComponent(filename)}/cover`
    return token ? `${base}?token=${token}` : base
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

    const canPlay = !!selectedGuild && !!selectedVoiceChannel

    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {sounds.map(sound => (
          <div
            key={sound.filename}
            onClick={() => canPlay && handlePlay(sound.filename, type)}
            title={
              !selectedGuild ? 'Select a guild first' :
              !selectedVoiceChannel ? 'Select a voice channel first' :
              `Play ${sound.name}`
            }
            className={`glass-light rounded-lg p-3 flex items-center gap-3 transition-all ${
              canPlay
                ? 'cursor-pointer hover:bg-white/10 hover:scale-[1.01] active:scale-[0.99]'
                : 'cursor-not-allowed opacity-60'
            }`}
          >
            {/* Cover art */}
            <div className="shrink-0 w-12 h-12 rounded-md overflow-hidden bg-slate-700/50 flex items-center justify-center">
              {sound.has_cover_art ? (
                <img
                  src={getCoverUrl(sound.filename, type)}
                  alt=""
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none'
                    e.currentTarget.nextElementSibling?.removeAttribute('style')
                  }}
                />
              ) : null}
              <Volume2 className={`w-5 h-5 text-slate-500 ${sound.has_cover_art ? 'hidden' : ''}`} />
            </div>

            {/* Title + tags */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-200 truncate" title={sound.name}>
                {sound.name}
              </p>
              {sound.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {sound.tags.map((tag) => (
                    <span
                      key={tag}
                      className="text-xs px-1.5 py-0.5 rounded-full bg-primary/20 text-primary"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Ellipsis menu (personal only) */}
            {type === 'personal' && (
              <div className="relative shrink-0" onClick={e => e.stopPropagation()}>
                <button
                  className="h-7 w-7 flex items-center justify-center rounded-full hover:bg-white/10 text-slate-400 hover:text-slate-200 transition-colors"
                  onClick={() => setOpenMenuFilename(openMenuFilename === sound.filename ? null : sound.filename)}
                  title="Options"
                >
                  <MoreVertical className="w-4 h-4" />
                </button>
                {openMenuFilename === sound.filename && (
                  <div className="absolute right-0 top-8 z-20 w-36 rounded-lg bg-slate-800 border border-white/10 shadow-xl overflow-hidden">
                    <button
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-200 hover:bg-white/10 transition-colors"
                      onClick={() => openEditModal(sound)}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      Edit
                    </button>
                    <button
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
                      onClick={() => { setOpenMenuFilename(null); handleDelete(sound.filename, type) }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Delete
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 h-[calc(100vh-8rem)]">
      <div className="shrink-0">
        <h2 className="text-3xl font-bold gradient-text mb-2">Soundboard</h2>
        <p className="text-slate-400">Play sound clips in Discord voice channels</p>
      </div>

      {/* Tabs and Search */}
      <div className="flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-2">
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

        {/* Search Bar + Upload (My Soundboard only) */}
        <div className="flex items-center gap-2">
          {activeTab === 'personal' && (
            <button
              onClick={() => {
                setUploadingFile(null)
                setUploadTags('')
                setShowUploadModal(true)
              }}
              className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/20 text-primary border border-primary/30 hover:bg-primary/30 transition-colors"
              title="Upload sound"
            >
              <Plus className="w-5 h-5" />
            </button>
          )}
          <div className="relative w-full max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by name or tag..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-lg bg-slate-800/50 border border-white/10 text-slate-200 placeholder-slate-500 focus:border-primary focus:outline-none"
            />
          </div>
        </div>
      </div>

      {loading && (
        <div className="flex-1 min-h-0 flex items-center justify-center text-slate-500">
          <div className="text-center">
            <Volume2 className="w-8 h-8 mx-auto mb-2 animate-pulse opacity-50" />
            <p>Loading sounds...</p>
          </div>
        </div>
      )}

      {!loading && activeTab === 'system' && (
        <div className="glass-card rounded-2xl overflow-hidden flex-1 min-h-0 flex flex-col p-4">
          <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-4 pt-2">
            {renderSoundGrid(filteredSystemSounds, 'system')}
          </div>
        </div>
      )}

      {!loading && activeTab === 'personal' && (
        <div className="glass-card rounded-2xl overflow-hidden flex-1 min-h-0 flex flex-col">
          {personalSounds.length >= quota && (
            <div className="flex items-center gap-2 text-amber-400 text-sm px-4 pb-2 shrink-0">
              <AlertCircle className="w-4 h-4" />
              Upload quota reached. Delete a sound to upload more.
            </div>
          )}
          <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-4 pt-2">
            {renderSoundGrid(filteredPersonalSounds, 'personal')}
          </div>
        </div>
      )}

      {/* Edit Sound Modal */}
      {editingSound && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={closeEditModal}
        >
          <div className="glass-card rounded-2xl p-6 max-w-md w-full space-y-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-semibold text-slate-200">Edit Sound</h3>
              <button onClick={closeEditModal} className="p-1 rounded-lg hover:bg-slate-700/50 text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Name */}
            <div>
              <label className="block text-sm text-slate-400 mb-1">Name</label>
              <input
                type="text"
                value={editName}
                onChange={e => setEditName(e.target.value)}
                className="w-full px-4 py-2 rounded-lg bg-slate-800/50 border border-white/10 text-slate-200 placeholder-slate-500 focus:border-primary focus:outline-none"
              />
            </div>

            {/* Tags */}
            <div>
              <label className="block text-sm text-slate-400 mb-1">Tags (comma separated)</label>
              <input
                type="text"
                value={editTags}
                onChange={e => setEditTags(e.target.value)}
                placeholder="funny, meme, notification"
                className="w-full px-4 py-2 rounded-lg bg-slate-800/50 border border-white/10 text-slate-200 placeholder-slate-500 focus:border-primary focus:outline-none"
              />
            </div>

            {/* Cover art */}
            <div>
              <label className="block text-sm text-slate-400 mb-1">Cover Art</label>
              <div
                onDragOver={e => { e.preventDefault(); setCoverDragOver(true) }}
                onDragLeave={() => setCoverDragOver(false)}
                onDrop={handleCoverDrop}
                onClick={() => coverInputRef.current?.click()}
                className={`relative flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed cursor-pointer transition-colors h-36 ${
                  coverDragOver
                    ? 'border-primary bg-primary/10'
                    : 'border-white/10 hover:border-primary/50 hover:bg-white/5'
                }`}
              >
                {editCoverPreview ? (
                  <img src={editCoverPreview} alt="Cover preview" className="h-full w-full object-cover rounded-xl" />
                ) : editingSound.has_cover_art ? (
                  <img
                    src={getCoverUrl(editingSound.filename, 'personal')}
                    alt="Current cover"
                    className="h-full w-full object-cover rounded-xl"
                    onError={e => { e.currentTarget.style.display = 'none' }}
                  />
                ) : (
                  <>
                    <ImagePlus className="w-8 h-8 text-slate-500" />
                    <span className="text-sm text-slate-500">Drag & drop or click to choose image</span>
                  </>
                )}
                {(editCoverPreview || editingSound.has_cover_art) && (
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
                onClick={closeEditModal}
                className="px-4 py-2 rounded-lg bg-slate-700/50 hover:bg-slate-700 text-slate-300 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={editSaving}
                className="px-4 py-2 rounded-lg bg-primary/80 hover:bg-primary text-white flex items-center gap-2 transition-colors disabled:opacity-50"
              >
                {editSaving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="glass-card rounded-2xl p-6 max-w-md w-full space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-semibold text-slate-200">Upload Sound</h3>
              <button
                onClick={() => {
                  setShowUploadModal(false)
                  setUploadingFile(null)
                  setUploadTags('')
                }}
                className="p-1 rounded-lg hover:bg-slate-700/50 text-slate-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-slate-400 mb-2">Audio File</label>
                <input
                  ref={personalInputRef}
                  type="file"
                  accept="audio/*"
                  onChange={e => {
                    const file = e.target.files?.[0] || null
                    setUploadingFile(file)
                  }}
                  className="w-full px-4 py-2 rounded-lg bg-slate-800/50 border border-white/10 text-slate-200 file:mr-4 file:py-1 file:px-3 file:rounded file:border-0 file:bg-primary/20 file:text-primary hover:file:bg-primary/30"
                />
              </div>

              <div>
                <label className="block text-sm text-slate-400 mb-2">
                  Tags (comma separated)
                </label>
                <input
                  type="text"
                  value={uploadTags}
                  onChange={(e) => setUploadTags(e.target.value)}
                  placeholder="funny, meme, notification"
                  className="w-full px-4 py-2 rounded-lg bg-slate-800/50 border border-white/10 text-slate-200 placeholder-slate-500 focus:border-primary focus:outline-none"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Tags will be applied after upload
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => {
                  setShowUploadModal(false)
                  setUploadingFile(null)
                  setUploadTags('')
                }}
                className="px-4 py-2 rounded-lg bg-slate-700/50 hover:bg-slate-700 text-slate-300 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (uploadingFile) {
                    handleUpload(uploadingFile, 'personal', uploadTags)
                    setShowUploadModal(false)
                    setUploadingFile(null)
                    setUploadTags('')
                  }
                }}
                disabled={!uploadingFile}
                className="px-4 py-2 rounded-lg bg-primary/80 hover:bg-primary text-white flex items-center gap-2 transition-colors disabled:opacity-50"
              >
                <Upload className="w-4 h-4" />
                Upload
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
