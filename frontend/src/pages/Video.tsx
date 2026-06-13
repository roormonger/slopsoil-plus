import { useState, useEffect, useCallback } from 'react'
import { Search, Play, Loader2, HardDrive, Film } from 'lucide-react'
import { Input } from '../components/ui/input'
import { Button } from '../components/ui/button'
import { useApi } from '../hooks/useApi'
import { useGuild } from '../contexts/GuildContext'

interface LocalVideo {
  name: string
  path: string
  thumbnail: string
}

export function Video() {
  const { fetchLocalVideo, playLocalVideo } = useApi()
  const { selectedGuild, selectedVoiceChannel } = useGuild()
  const [videos, setVideos] = useState<LocalVideo[]>([])
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [playingId, setPlayingId] = useState<string | null>(null)

  const loadVideos = useCallback(async () => {
    setLoading(true)
    const data = await fetchLocalVideo()
    setVideos(data?.videos ?? [])
    setLoading(false)
  }, [fetchLocalVideo])

  useEffect(() => {
    loadVideos()
  }, [loadVideos])

  const handlePlay = async (video: LocalVideo) => {
    if (!selectedGuild) return
    setPlayingId(video.path)
    const title = video.name.replace(/\.[^.]+$/, '')
    await playLocalVideo(selectedGuild, video.path, title, video.thumbnail, selectedVoiceChannel)
    setPlayingId(null)
  }

  const filteredVideos = videos.filter(v =>
    v.name.toLowerCase().includes(searchQuery.trim().toLowerCase())
  )

  return (
    <div className="flex flex-col gap-6 h-[calc(100vh-8rem)]">
      <div className="shrink-0">
        <h2 className="text-3xl font-bold gradient-text mb-2">Video</h2>
        <p className="text-slate-400">Local video library</p>
      </div>

      <div className="glass-card rounded-2xl flex-1 min-h-0 flex flex-col">
        {/* Search bar */}
        <div className="flex gap-3 p-4 border-b border-white/5 shrink-0">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search videos…"
              className="pl-10 h-10 glass-input text-slate-200"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={loadVideos}
            disabled={loading}
            className="h-10 glass-light border-white/10 text-slate-300 hover:bg-white/10"
          >
            <Loader2 className={`h-4 w-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {/* Content area */}
        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-4">
          {loading ? (
            <div className="flex items-center justify-center h-full gap-3">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <span className="text-slate-400 text-sm">Loading videos…</span>
            </div>
          ) : filteredVideos.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 p-8">
              <HardDrive className="h-10 w-10 text-slate-500" />
              <p className="text-slate-400 text-sm">
                {searchQuery.trim()
                  ? 'No matching videos found'
                  : 'No local videos found — add a video source in Settings'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {filteredVideos.map(video => {
                const displayName = video.name.replace(/\.[^.]+$/, '')
                return (
                  <div
                    key={video.path}
                    className="group relative rounded-xl overflow-hidden bg-slate-800/50 border border-white/5 hover:border-primary/30 transition-all"
                  >
                    {/* Thumbnail */}
                    <div className="aspect-video bg-slate-900 relative">
                      {video.thumbnail ? (
                        <img
                          src={video.thumbnail}
                          alt={displayName}
                          className="w-full h-full object-cover"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Film className="h-8 w-8 text-slate-600" />
                        </div>
                      )}
                      {/* Play overlay */}
                      <button
                        onClick={() => handlePlay(video)}
                        disabled={!selectedGuild || playingId === video.path}
                        className={`absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity ${
                          !selectedGuild ? 'cursor-not-allowed' : ''
                        }`}
                      >
                        {playingId === video.path ? (
                          <Loader2 className="h-10 w-10 animate-spin text-white" />
                        ) : (
                          <div className="w-12 h-12 rounded-full bg-primary/80 flex items-center justify-center">
                            <Play className="h-5 w-5 text-white ml-0.5" />
                          </div>
                        )}
                      </button>
                    </div>
                    {/* Title */}
                    <div className="p-2.5">
                      <p className="text-xs text-slate-300 truncate" title={displayName}>
                        {displayName}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
