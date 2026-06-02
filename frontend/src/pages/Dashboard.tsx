import { useState, useEffect } from 'react'
import { Loader2, Radio, Users, Server, Zap, Music2, Video } from 'lucide-react'
import { Badge } from '../components/ui/badge'
import { useApi } from '../hooks/useApi'
import type { BotStatus, NowPlaying, MusicStatus } from '../types'

export function Dashboard() {
  const api = useApi()
  const [status, setStatus] = useState<BotStatus | null>(null)
  const [nowPlaying, setNowPlaying] = useState<NowPlaying[]>([])
  const [musicStatus, setMusicStatus] = useState<MusicStatus | null>(null)
  const [loading, setLoading] = useState(true)

  // Load initial data
  useEffect(() => {
    const loadData = async () => {
      setLoading(true)
      const [statusData, nowPlayingData, musicStatusData] = await Promise.all([
        api.fetchStatus(),
        api.fetchNowPlaying(),
        api.fetchMusicStatus(),
      ])
      if (statusData) setStatus(statusData)
      if (nowPlayingData) setNowPlaying(nowPlayingData)
      if (musicStatusData) setMusicStatus(musicStatusData)
      setLoading(false)
    }
    loadData()
  }, [])

  // Refresh music and now playing status every 5 seconds
  useEffect(() => {
    const interval = setInterval(async () => {
      const nowPlayingData = await api.fetchNowPlaying()
      if (nowPlayingData) setNowPlaying(nowPlayingData)
      const musicStatusData = await api.fetchMusicStatus()
      if (musicStatusData) setMusicStatus(musicStatusData)
    }, 5000)
    return () => clearInterval(interval)
  }, [])

  
  
  const getStatusBadge = () => {
    switch (status?.status) {
      case 'running':
        return <Badge className="bg-green-500">Running</Badge>
      case 'stopped':
        return <Badge variant="destructive">Stopped</Badge>
      case 'pending_reload':
        return <Badge variant="secondary">Reloading...</Badge>
      default:
        return <Badge variant="outline">Unknown</Badge>
    }
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
        <h2 className="text-3xl font-bold gradient-text mb-2">Dashboard</h2>
        <p className="text-slate-400">System overview and real-time status</p>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-6">
        <div className="glass-card rounded-2xl p-4 hover-lift">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Status</span>
            <div className={`w-2 h-2 rounded-full ${status?.status === 'running' ? 'bg-emerald-400 status-pulse' : status?.status === 'stopped' ? 'bg-red-400' : 'bg-amber-400'}`} />
          </div>
          <div className="text-2xl font-semibold">{getStatusBadge()}</div>
        </div>

        <div className="glass-card rounded-2xl p-4 hover-lift">
          <div className="flex items-center gap-2 mb-3">
            <Zap className="w-4 h-4 text-primary" />
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Running</span>
          </div>
          <div className="text-2xl font-semibold text-slate-200">{status?.running ? 'Yes' : 'No'}</div>
        </div>

        <div className="glass-card rounded-2xl p-4 hover-lift">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-4 h-4 rounded-full border-2 border-primary/50" />
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Token</span>
          </div>
          <div className="text-2xl font-semibold text-slate-200">{status?.has_token ? 'Yes' : 'No'}</div>
        </div>

        <div className="glass-card rounded-2xl p-4 hover-lift">
          <div className="flex items-center gap-2 mb-3">
            <Server className="w-4 h-4 text-primary" />
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Servers</span>
          </div>
          <div className="text-2xl font-semibold text-slate-200">{status?.guild_count || 0}</div>
        </div>

        <div className="glass-card rounded-2xl p-4 hover-lift">
          <div className="flex items-center gap-2 mb-3">
            <Users className="w-4 h-4 text-primary" />
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Users</span>
          </div>
          <div className="text-2xl font-semibold text-slate-200">{status?.user_count || 0}</div>
        </div>

        <div className="glass-card rounded-2xl p-4 hover-lift">
          <div className="flex items-center gap-2 mb-3">
            <Radio className="w-4 h-4 text-primary" />
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Streams</span>
          </div>
          <div className="text-2xl font-semibold text-slate-200">{status?.streaming_count || 0}</div>
        </div>
      </div>

      
      {/* Video Now Playing */}
      <div className="glass-card rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xl font-semibold text-slate-200 flex items-center gap-2">
              <Video className="w-5 h-5 text-primary" />
              Video Now Playing
            </h3>
            <p className="text-sm text-slate-400">Currently streaming videos</p>
          </div>
          <Badge className="glass-light border-white/10 text-slate-300">Live</Badge>
        </div>

        {nowPlaying.length === 0 ? (
          <div className="p-8 text-center glass-light rounded-xl">
            <Video className="w-8 h-8 text-slate-500 mx-auto mb-3" />
            <p className="text-slate-400">No videos are currently streaming</p>
          </div>
        ) : (
          <div className="space-y-3">
            {nowPlaying.map((stream) => (
              <div
                key={stream.guild_id}
                className="flex items-center justify-between p-4 glass-light rounded-xl hover-lift border-l-4 border-primary"
              >
                <div>
                  <p className="font-medium text-slate-200">{stream.title}</p>
                  <p className="text-sm text-slate-400">{stream.guild_name}</p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-red-500 status-pulse" />
                  <Badge className="glass-light border-white/10 text-slate-300">Streaming</Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Voice Now Playing */}
      <div className="glass-card rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xl font-semibold text-slate-200 flex items-center gap-2">
              <Music2 className="w-5 h-5 text-primary" />
              Voice Now Playing
            </h3>
            <p className="text-sm text-slate-400">Currently playing music over voice</p>
          </div>
          {musicStatus?.is_playing ? (
            <Badge className="glass-light border-emerald-500/30 text-emerald-300">Playing</Badge>
          ) : musicStatus?.is_paused ? (
            <Badge className="glass-light border-amber-500/30 text-amber-300">Paused</Badge>
          ) : (
            <Badge className="glass-light border-white/10 text-slate-300">Idle</Badge>
          )}
        </div>

        {musicStatus?.current ? (
          <div className="p-4 glass-light rounded-xl">
            <div className="flex gap-4">
              {musicStatus.current.thumbnail ? (
                <img
                  src={musicStatus.current.thumbnail}
                  alt={musicStatus.current.title}
                  className="w-16 h-16 rounded-lg object-cover"
                />
              ) : (
                <div className="w-16 h-16 rounded-lg glass-light flex items-center justify-center">
                  <Music2 className="w-6 h-6 text-slate-400" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="font-medium text-slate-200 truncate">{musicStatus.current.title}</p>
                <p className="text-sm text-slate-400">
                  Duration: {musicStatus.current.duration > 0 
                    ? `${Math.floor(musicStatus.current.duration / 60)}:${(musicStatus.current.duration % 60).toString().padStart(2, '0')}`
                    : 'Live'}
                </p>
                <p className="text-xs text-slate-500">
                  Requested by: {musicStatus.current.requested_by}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${musicStatus.is_playing ? 'bg-emerald-500 status-pulse' : 'bg-amber-500'}`} />
                <span className="text-xs text-slate-400">
                  Volume: {Math.round((musicStatus.volume || 1.0) * 100)}%
                </span>
              </div>
            </div>
            {musicStatus.queue_length > 0 && (
              <div className="mt-3 pt-3 border-t border-white/10">
                <p className="text-xs text-slate-500">
                  {musicStatus.queue_length} song{musicStatus.queue_length !== 1 ? 's' : ''} in queue
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="p-8 text-center glass-light rounded-xl">
            <Music2 className="w-8 h-8 text-slate-500 mx-auto mb-3" />
            <p className="text-slate-400">No music is currently playing</p>
          </div>
        )}
      </div>
    </div>
  )
}
