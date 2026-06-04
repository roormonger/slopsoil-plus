import { useState, useEffect } from 'react'
import { Loader2, Radio, Users, Server, Zap, Music2, Video, Clock, MessageSquare, Globe, Trophy, Settings, Activity } from 'lucide-react'
import { Badge } from '../components/ui/badge'
import { useApi } from '../hooks/useApi'
import { useWebSocketContext } from '../context/WebSocketContext'
import type { BotStatus, NowPlaying, MusicStatus, CommandStats, Config } from '../types'

function formatUptime(seconds: number): string {
  if (seconds === 0) return 'Offline'
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  const parts: string[] = []
  if (d > 0) parts.push(`${d}d`)
  if (h > 0) parts.push(`${h}h`)
  if (m > 0) parts.push(`${m}m`)
  if (s > 0 && d === 0) parts.push(`${s}s`)
  return parts.join(' ') || '0s'
}

export function Dashboard() {
  const api = useApi()
  const { botStatus: wsBotStatus, nowPlaying: wsNowPlaying, musicStatus: wsMusicStatus } = useWebSocketContext()
  const [status, setStatus] = useState<BotStatus | null>(null)
  const [nowPlaying, setNowPlaying] = useState<NowPlaying[]>([])
  const [musicStatus, setMusicStatus] = useState<MusicStatus | null>(null)
  const [commandStats, setCommandStats] = useState<CommandStats | null>(null)
  const [config, setConfig] = useState<Config | null>(null)
  const [loading, setLoading] = useState(true)

  // Load initial data once on mount
  useEffect(() => {
    const loadData = async () => {
      setLoading(true)
      const [statusData, nowPlayingData, musicStatusData, cmdStatsData, configData] = await Promise.all([
        api.fetchStatus(),
        api.fetchNowPlaying(),
        api.fetchMusicStatus(),
        api.fetchCommandStats(),
        api.fetchConfig(),
      ])
      if (statusData) setStatus(statusData)
      if (nowPlayingData) setNowPlaying(nowPlayingData)
      if (musicStatusData) setMusicStatus(musicStatusData)
      if (cmdStatsData) setCommandStats(cmdStatsData)
      if (configData) setConfig(configData.settings)
      setLoading(false)
    }
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Sync WebSocket updates into local state
  useEffect(() => {
    if (wsBotStatus) setStatus(wsBotStatus)
  }, [wsBotStatus])

  useEffect(() => {
    setNowPlaying(wsNowPlaying)
  }, [wsNowPlaying])

  useEffect(() => {
    if (wsMusicStatus) setMusicStatus(wsMusicStatus)
  }, [wsMusicStatus])

  const getStatusBadge = () => {
    switch (status?.status) {
      case 'online':
      case 'running':
        return <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30">Online</Badge>
      case 'offline':
      case 'stopped':
        return <Badge variant="destructive">Offline</Badge>
      case 'pending_reload':
        return <Badge variant="secondary">Reloading...</Badge>
      default:
        return <Badge variant="outline">Unknown</Badge>
    }
  }

  const chatCommands = commandStats?.by_source?.discord || 0
  const webCommands = commandStats?.by_source?.web || 0
  const topUser = commandStats?.by_user?.[0]
  const streamQuality = config ? `${config.stream_quality} @ ${config.stream_fps}fps` : '-'

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

      {/* Unified Stats Panel */}
      <div className="glass-card rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-5">
          <Activity className="w-5 h-5 text-primary" />
          <h3 className="text-lg font-semibold text-slate-200">System Stats</h3>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-px bg-white/5 rounded-xl overflow-hidden">
          {/* Uptime */}
          <div className="bg-slate-900/40 p-4 hover:bg-slate-800/40 transition-colors">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="w-3.5 h-3.5 text-primary" />
              <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Uptime</span>
            </div>
            <div className="text-lg font-semibold text-slate-200">{formatUptime(status?.uptime || 0)}</div>
          </div>

          {/* Status */}
          <div className="bg-slate-900/40 p-4 hover:bg-slate-800/40 transition-colors">
            <div className="flex items-center gap-2 mb-2">
              <div className={`w-3 h-3 rounded-full ${status?.running ? 'bg-emerald-400 status-pulse' : 'bg-red-400'}`} />
              <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Status</span>
            </div>
            <div className="text-lg font-semibold">{getStatusBadge()}</div>
          </div>

          {/* Servers */}
          <div className="bg-slate-900/40 p-4 hover:bg-slate-800/40 transition-colors">
            <div className="flex items-center gap-2 mb-2">
              <Server className="w-3.5 h-3.5 text-primary" />
              <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Servers</span>
            </div>
            <div className="text-lg font-semibold text-slate-200">{status?.guild_count || 0}</div>
          </div>

          {/* Users */}
          <div className="bg-slate-900/40 p-4 hover:bg-slate-800/40 transition-colors">
            <div className="flex items-center gap-2 mb-2">
              <Users className="w-3.5 h-3.5 text-primary" />
              <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Users</span>
            </div>
            <div className="text-lg font-semibold text-slate-200">{status?.user_count || 0}</div>
          </div>

          {/* Active Streams */}
          <div className="bg-slate-900/40 p-4 hover:bg-slate-800/40 transition-colors">
            <div className="flex items-center gap-2 mb-2">
              <Radio className="w-3.5 h-3.5 text-primary" />
              <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Active Streams</span>
            </div>
            <div className="text-lg font-semibold text-slate-200">{status?.streaming_count || 0}</div>
          </div>

          {/* Total Commands */}
          <div className="bg-slate-900/40 p-4 hover:bg-slate-800/40 transition-colors">
            <div className="flex items-center gap-2 mb-2">
              <Zap className="w-3.5 h-3.5 text-primary" />
              <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Total Commands</span>
            </div>
            <div className="text-lg font-semibold text-slate-200">{commandStats?.total || 0}</div>
          </div>

          {/* Chat Commands */}
          <div className="bg-slate-900/40 p-4 hover:bg-slate-800/40 transition-colors">
            <div className="flex items-center gap-2 mb-2">
              <MessageSquare className="w-3.5 h-3.5 text-primary" />
              <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Chat Commands</span>
            </div>
            <div className="text-lg font-semibold text-slate-200">{chatCommands}</div>
          </div>

          {/* Web UI Commands */}
          <div className="bg-slate-900/40 p-4 hover:bg-slate-800/40 transition-colors">
            <div className="flex items-center gap-2 mb-2">
              <Globe className="w-3.5 h-3.5 text-primary" />
              <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Web UI Commands</span>
            </div>
            <div className="text-lg font-semibold text-slate-200">{webCommands}</div>
          </div>

          {/* Top User */}
          <div className="bg-slate-900/40 p-4 hover:bg-slate-800/40 transition-colors col-span-2 md:col-span-1">
            <div className="flex items-center gap-2 mb-2">
              <Trophy className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Top User</span>
            </div>
            <div className="text-lg font-semibold text-slate-200 truncate" title={topUser?.username || '-'}>
              {topUser ? `${topUser.username} (${topUser.count})` : '-'}
            </div>
          </div>

          {/* Stream Quality */}
          <div className="bg-slate-900/40 p-4 hover:bg-slate-800/40 transition-colors col-span-2 md:col-span-1">
            <div className="flex items-center gap-2 mb-2">
              <Settings className="w-3.5 h-3.5 text-primary" />
              <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Stream Quality</span>
            </div>
            <div className="text-lg font-semibold text-slate-200 truncate" title={streamQuality}>
              {streamQuality}
            </div>
          </div>
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
