import { useState, useEffect, useCallback } from 'react'
import { Music2, Play, Pause, SkipForward, SkipBack, Volume2, Volume1, VolumeX, Search, ListMusic, Trash2 } from 'lucide-react'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { useApi } from '../hooks/useApi'
import { useGuild } from '../contexts/GuildContext'
import type { MusicStatus } from '../types'

export function Music() {
  const api = useApi()
  const { selectedGuild } = useGuild()
  const [status, setStatus] = useState<MusicStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [isSearching, setIsSearching] = useState(false)

  // Fetch music status
  const loadStatus = useCallback(async () => {
    const data = await api.fetchMusicStatus()
    if (data) {
      setStatus(data)
    }
    setLoading(false)
  }, [api])

  // Initial load and polling
  useEffect(() => {
    loadStatus()
    const interval = setInterval(loadStatus, 3000)
    return () => clearInterval(interval)
  }, [loadStatus])

  const handlePlay = async () => {
    if (!selectedGuild || !searchQuery.trim()) return
    setIsSearching(true)
    await api.playMusic(selectedGuild, searchQuery.trim())
    setSearchQuery('')
    setIsSearching(false)
    loadStatus()
  }

  const handleControl = async (action: 'stop' | 'skip' | 'back' | 'pause' | 'resume') => {
    if (!selectedGuild) return
    await api.controlMusic(selectedGuild, action)
    loadStatus()
  }

  const handleVolumeChange = async (volume: number) => {
    if (!selectedGuild) return
    await api.setMusicVolume(selectedGuild, volume)
    loadStatus()
  }

  const formatDuration = (seconds: number) => {
    if (!seconds || seconds <= 0) return '?:??'
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const getVolumeIcon = () => {
    if (!status || status.volume === 0) return <VolumeX className="w-5 h-5" />
    if (status.volume < 0.5) return <Volume1 className="w-5 h-5" />
    return <Volume2 className="w-5 h-5" />
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="mb-8">
          <h2 className="text-3xl font-bold gradient-text mb-2">Music</h2>
          <p className="text-slate-400">Music streaming and playlist management</p>
        </div>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
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
        <h2 className="text-3xl font-bold gradient-text mb-2">Music</h2>
        <p className="text-slate-400">Music streaming and playlist management</p>
      </div>

      
      {/* Search & Play */}
      <div className="glass-card rounded-2xl p-6">
        <label className="text-sm font-medium text-slate-400 mb-2 block">
          <Search className="w-4 h-4 inline mr-2" />
          Search YouTube or Enter URL
        </label>
        <div className="flex gap-3">
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handlePlay()}
            placeholder="Search for music or paste YouTube URL..."
            className="glass-input text-slate-200 flex-1"
          />
          <Button
            onClick={handlePlay}
            disabled={!selectedGuild || !searchQuery.trim() || isSearching}
            className="bg-primary/20 text-primary border border-primary/30 hover:bg-primary/30"
          >
            {isSearching ? (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary" />
            ) : (
              <Play className="w-4 h-4" />
            )}
          </Button>
        </div>
      </div>

      {/* Now Playing */}
      <div className="glass-card rounded-2xl p-6">
        <h3 className="text-xl font-semibold text-slate-200 mb-4 flex items-center gap-2">
          <Music2 className="w-5 h-5 text-primary" />
          Now Playing
        </h3>

        {status?.current ? (
          <div className="space-y-4">
            {/* Track Info */}
            <div className="flex gap-4">
              {status.current.thumbnail ? (
                <img
                  src={status.current.thumbnail}
                  alt={status.current.title}
                  className="w-24 h-24 rounded-xl object-cover"
                />
              ) : (
                <div className="w-24 h-24 rounded-xl glass-light flex items-center justify-center">
                  <Music2 className="w-8 h-8 text-slate-400" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <h4 className="text-lg font-medium text-slate-200 truncate">
                  {status.current.title}
                </h4>
                <p className="text-sm text-slate-400">
                  Duration: {formatDuration(status.current.duration)}
                </p>
                <p className="text-sm text-slate-500">
                  Requested by: {status.current.requested_by}
                </p>
                <a
                  href={status.current.webpage_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary hover:underline mt-1 inline-block"
                >
                  View on YouTube
                </a>
              </div>
            </div>

            {/* Playback Controls */}
            <div className="flex items-center justify-center gap-3 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleControl('back')}
                className="glass-light border-white/10 text-slate-300 hover:bg-white/10"
              >
                <SkipBack className="w-4 h-4" />
              </Button>

              {status.is_playing ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleControl('pause')}
                  className="glass-light border-white/10 text-slate-300 hover:bg-white/10"
                >
                  <Pause className="w-4 h-4" />
                </Button>
              ) : status.is_paused ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleControl('resume')}
                  className="glass-light border-white/10 text-slate-300 hover:bg-white/10"
                >
                  <Play className="w-4 h-4" />
                </Button>
              ) : null}

              <Button
                variant="outline"
                size="sm"
                onClick={() => handleControl('stop')}
                className="glass-light border-red-400/30 text-red-400 hover:bg-red-500/10"
              >
                <Trash2 className="w-4 h-4" />
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => handleControl('skip')}
                className="glass-light border-white/10 text-slate-300 hover:bg-white/10"
              >
                <SkipForward className="w-4 h-4" />
              </Button>
            </div>

            {/* Volume Control */}
            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={() => handleVolumeChange(0)}
                className="text-slate-400 hover:text-slate-200"
              >
                {getVolumeIcon()}
              </button>
              <input
                type="range"
                min="0"
                max="100"
                value={Math.round((status?.volume || 1.0) * 100)}
                onChange={(e) => handleVolumeChange(parseInt(e.target.value))}
                className="flex-1 h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-primary"
              />
              <span className="text-sm text-slate-400 w-12 text-right">
                {Math.round((status?.volume || 1.0) * 100)}%
              </span>
            </div>
          </div>
        ) : (
          <div className="text-center py-8">
            <Music2 className="w-12 h-12 text-slate-500 mx-auto mb-3" />
            <p className="text-slate-400">Nothing is playing right now.</p>
            <p className="text-slate-500 text-sm mt-1">
              Search for a song above or use !music in Discord.
            </p>
          </div>
        )}
      </div>

      {/* Queue */}
      <div className="glass-card rounded-2xl p-6">
        <h3 className="text-xl font-semibold text-slate-200 mb-4 flex items-center gap-2">
          <ListMusic className="w-5 h-5 text-primary" />
          Queue ({status?.queue_length || 0})
        </h3>

        {status?.queue && status.queue.length > 0 ? (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {status.queue.map((track, index) => (
              <div
                key={`${track.url}-${index}`}
                className="flex items-center gap-3 p-3 glass-light rounded-xl"
              >
                <span className="text-sm text-slate-500 w-6">{index + 1}</span>
                {track.thumbnail ? (
                  <img
                    src={track.thumbnail}
                    alt={track.title}
                    className="w-10 h-10 rounded-lg object-cover"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-lg glass-light flex items-center justify-center">
                    <Music2 className="w-4 h-4 text-slate-400" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-200 truncate">
                    {track.title}
                  </p>
                  <p className="text-xs text-slate-500">
                    {formatDuration(track.duration)} • {track.requested_by}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-6">
            <ListMusic className="w-10 h-10 text-slate-500 mx-auto mb-2" />
            <p className="text-slate-400">Queue is empty.</p>
          </div>
        )}
      </div>
    </div>
  )
}

