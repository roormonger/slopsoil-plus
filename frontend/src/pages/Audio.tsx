import { useState, useEffect, useRef, useCallback } from 'react'
import { Youtube, Tv2, HardDrive, ListMusic, Search, Play, Loader2, Music2, ChevronRight, Disc3, Mic2, Library } from 'lucide-react'
import { Input } from '../components/ui/input'
import { Button } from '../components/ui/button'
import { useApi } from '../hooks/useApi'
import { useGuild } from '../contexts/GuildContext'
import type { TrackMeta } from '../types'

type TabKey = 'youtube' | 'jellyfin' | 'local' | 'playlists'

const TABS: { key: TabKey; label: string; icon: typeof Youtube }[] = [
  { key: 'youtube',   label: 'YouTube',   icon: Youtube   },
  { key: 'jellyfin',  label: 'Jellyfin',  icon: Tv2       },
  { key: 'local',     label: 'Local',     icon: HardDrive },
  { key: 'playlists', label: 'Playlists', icon: ListMusic },
]

const SEARCH_PLACEHOLDERS: Record<TabKey, string> = {
  youtube:   'Search YouTube…',
  jellyfin:  'Search Jellyfin library…',
  local:     'Search local files…',
  playlists: 'Search playlists…',
}

const PAGE_SIZE = 25

function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return '?:??'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

export function Audio() {
  const api = useApi()
  const { selectedGuild, selectedVoiceChannel } = useGuild()
  const [activeTab, setActiveTab] = useState<TabKey>('youtube')
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState('name')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')

  const [feed, setFeed] = useState<TrackMeta[]>([])
  const [searchResults, setSearchResults] = useState<TrackMeta[]>([])
  const [feedLoading, setFeedLoading] = useState(false)
  const [searchLoading, setSearchLoading] = useState(false)
  const [playingId, setPlayingId] = useState<string | null>(null)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sentinelRef = useRef<HTMLDivElement | null>(null)

  const [jfUrl, setJfUrl] = useState<string>('')

  // Jellyfin music state
  const [jfLibraries, setJfLibraries] = useState<any[]>([])
  const [jfLibLoading, setJfLibLoading] = useState(false)
  const [jfSelectedLib, setJfSelectedLib] = useState<any | null>(null)
  const [jfArtists, setJfArtists] = useState<any[]>([])
  const [jfArtistsLoading, setJfArtistsLoading] = useState(false)
  const [jfSelectedArtist, setJfSelectedArtist] = useState<any | null>(null)
  const [jfAlbums, setJfAlbums] = useState<any[]>([])
  const [jfAlbumsLoading, setJfAlbumsLoading] = useState(false)
  const [jfSelectedAlbum, setJfSelectedAlbum] = useState<any | null>(null)
  const [jfTracks, setJfTracks] = useState<any[]>([])
  const [jfTracksLoading, setJfTracksLoading] = useState(false)
  const [jfPlayingId, setJfPlayingId] = useState<string | null>(null)

  // Jellyfin music: load libraries on tab enter
  useEffect(() => {
    if (activeTab !== 'jellyfin') return
    api.fetchConfig().then(d => { if (d?.settings?.jellyfin_url) setJfUrl(d.settings.jellyfin_url) })
    setJfLibLoading(true)
    api.fetchJellyfinMusicLibraries().then(data => {
      const libs = data ?? []
      setJfLibraries(libs)
      setJfLibLoading(false)
      if (libs.length === 1) {
        setJfSelectedLib(libs[0])
      }
    })
  }, [activeTab])

  // Load artists when library is selected (or single-library auto-select)
  useEffect(() => {
    if (!jfSelectedLib) return
    setJfArtistsLoading(true)
    setJfSelectedArtist(null)
    setJfAlbums([])
    setJfSelectedAlbum(null)
    setJfTracks([])
    api.fetchJellyfinMusicArtists(jfSelectedLib.Id, '', 200).then(data => {
      setJfArtists(data?.items ?? [])
      setJfArtistsLoading(false)
    })
  }, [jfSelectedLib?.Id])

  // Load albums when artist is selected
  useEffect(() => {
    if (!jfSelectedArtist) return
    setJfAlbumsLoading(true)
    setJfSelectedAlbum(null)
    setJfTracks([])
    api.fetchJellyfinMusicAlbums(jfSelectedArtist.Id).then(data => {
      setJfAlbums(data?.items ?? [])
      setJfAlbumsLoading(false)
    })
  }, [jfSelectedArtist?.Id])

  // Load tracks when album is selected
  useEffect(() => {
    if (!jfSelectedAlbum) return
    setJfTracksLoading(true)
    api.fetchJellyfinMusicTracks(jfSelectedAlbum.Id).then(data => {
      setJfTracks(data?.items ?? [])
      setJfTracksLoading(false)
    })
  }, [jfSelectedAlbum?.Id])

  const handleJfPlay = async (track: any) => {
    if (!selectedGuild) return
    setJfPlayingId(track.Id)
    const thumbUrl = jfUrl && (track.ImageTags?.Primary
      ? `${jfUrl}/Items/${track.Id}/Images/Primary?tag=${track.ImageTags.Primary}&quality=80&maxWidth=96`
      : jfSelectedAlbum?.ImageTags?.Primary
        ? `${jfUrl}/Items/${jfSelectedAlbum.Id}/Images/Primary?tag=${jfSelectedAlbum.ImageTags.Primary}&quality=80&maxWidth=96`
        : jfSelectedArtist?.ImageTags?.Primary
          ? `${jfUrl}/Items/${jfSelectedArtist.Id}/Images/Primary?tag=${jfSelectedArtist.ImageTags.Primary}&quality=80&maxWidth=96`
          : '')
    const title = jfSelectedArtist?.Name ? `${jfSelectedArtist.Name} - ${track.Name}` : track.Name
    const thumbPart = thumbUrl ? ` thumb:${thumbUrl}` : ''
    await api.executeCommand(selectedGuild, 'jf', `id:${track.Id} title:${title}${thumbPart}`, selectedVoiceChannel)
    setJfPlayingId(null)
  }

  const isSearching = searchQuery.trim().length > 0
  const tracks = isSearching ? searchResults : feed

  useEffect(() => {
    if (activeTab !== 'youtube') return
    setFeedLoading(true)
    setVisibleCount(PAGE_SIZE)
    api.fetchYoutubeFeed(100).then(data => {
      if (data) setFeed(data)
      setFeedLoading(false)
    })
  }, [activeTab])

  useEffect(() => {
    if (activeTab !== 'youtube') return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const q = searchQuery.trim()
    if (!q) { setSearchResults([]); setSearchLoading(false); setVisibleCount(PAGE_SIZE); return }
    setSearchLoading(true)
    setVisibleCount(PAGE_SIZE)
    debounceRef.current = setTimeout(async () => {
      const data = await api.searchYoutube(q, 100)
      if (data) setSearchResults(data)
      setSearchLoading(false)
    }, 500)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [searchQuery, activeTab])

  const sortedTracks = [...tracks].sort((a, b) => {
    let cmp = 0
    if (sortBy === 'name') cmp = a.title.localeCompare(b.title)
    else if (sortBy === 'duration') cmp = a.duration - b.duration
    return sortOrder === 'asc' ? cmp : -cmp
  })

  const visibleTracks = sortedTracks.slice(0, visibleCount)
  const hasMore = visibleCount < sortedTracks.length

  const loadMore = useCallback(() => {
    setVisibleCount(n => Math.min(n + PAGE_SIZE, sortedTracks.length))
  }, [sortedTracks.length])

  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return
    const observer = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) loadMore()
    }, { threshold: 0.1 })
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [loadMore])

  const handlePlay = async (track: TrackMeta) => {
    if (!selectedGuild) return
    setPlayingId(track.id)
    await api.playMusic(selectedGuild, track.webpage_url, selectedVoiceChannel)
    setPlayingId(null)
  }

  return (
    <div className="flex flex-col gap-6 h-[calc(100vh-8rem)]">
      <div className="shrink-0">
        <h2 className="text-3xl font-bold gradient-text mb-2">Audio</h2>
        <p className="text-slate-400">Audio streaming and queue management</p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 p-1 glass-card rounded-2xl w-fit shrink-0">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => { setActiveTab(key); setSearchQuery('') }}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
              activeTab === key
                ? 'bg-primary/20 text-primary'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="glass-card rounded-2xl flex-1 min-h-0 flex flex-col">
        {/* Search / filter bar */}
        <div className="flex gap-3 p-4 border-b border-white/5 shrink-0">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={SEARCH_PLACEHOLDERS[activeTab]}
              className="pl-10 h-10 glass-input text-slate-200"
            />
          </div>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="h-10 px-3 rounded-xl glass-input text-sm text-slate-200 outline-none focus:ring-2 focus:ring-primary/50 shrink-0"
          >
            <option value="name">Name</option>
            <option value="duration">Duration</option>
          </select>
          <select
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value as 'asc' | 'desc')}
            className="h-10 px-3 rounded-xl glass-input text-sm text-slate-200 outline-none focus:ring-2 focus:ring-primary/50 shrink-0"
          >
            <option value="asc">Asc</option>
            <option value="desc">Desc</option>
          </select>
        </div>

        {/* Content area */}
        <div className={`flex-1 min-h-0 ${activeTab === 'jellyfin' ? 'overflow-hidden' : 'overflow-y-auto custom-scrollbar'}`}>
          {activeTab === 'youtube' && (
            feedLoading || searchLoading ? (
              <div className="flex items-center justify-center h-full gap-3">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <span className="text-slate-400 text-sm">{searchLoading ? 'Searching…' : 'Loading feed…'}</span>
              </div>
            ) : sortedTracks.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 p-8">
                <Music2 className="h-10 w-10 text-slate-500" />
                <p className="text-slate-400 text-sm">{isSearching ? 'No results found' : 'No feed items — add genres or playlists in Settings → Audio'}</p>
              </div>
            ) : (
              <div className="divide-y divide-white/5">
                {visibleTracks.map(track => (
                  <div key={track.id} className="flex items-center gap-4 px-4 py-3 hover:bg-white/5 transition-colors group">
                    {track.thumbnail ? (
                      <img src={track.thumbnail} alt={track.title} className="w-16 h-10 rounded-lg object-cover shrink-0" />
                    ) : (
                      <div className="w-16 h-10 rounded-lg glass-light flex items-center justify-center shrink-0">
                        <Music2 className="h-4 w-4 text-slate-500" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-200 truncate">{track.title}</p>
                      <p className="text-xs text-slate-500 truncate">{track.uploader}</p>
                    </div>
                    <span className="text-xs text-slate-500 shrink-0">{formatDuration(track.duration)}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={!selectedGuild || playingId === track.id}
                      onClick={() => handlePlay(track)}
                      className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-primary hover:text-primary hover:bg-primary/10"
                      title={!selectedGuild ? 'Select a guild first' : 'Play'}
                    >
                      {playingId === track.id
                        ? <Loader2 className="h-4 w-4 animate-spin" />
                        : <Play className="h-4 w-4" />
                      }
                    </Button>
                  </div>
                ))}
                {hasMore && (
                  <div ref={sentinelRef} className="flex items-center justify-center py-4">
                    <Loader2 className="h-4 w-4 animate-spin text-slate-500" />
                  </div>
                )}
              </div>
            )
          )}

          {activeTab === 'jellyfin' && (
            jfLibLoading ? (
              <div className="flex items-center justify-center h-full gap-3">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <span className="text-slate-400 text-sm">Loading Jellyfin…</span>
              </div>
            ) : jfLibraries.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 p-8">
                <Tv2 className="h-10 w-10 text-slate-500" />
                <p className="text-slate-400 text-sm">No music libraries found — check Jellyfin settings</p>
              </div>
            ) : (
              <div className="flex h-full min-h-0">
                {/* Library column — only shown if multiple libraries */}
                {jfLibraries.length > 1 && (
                  <div className="w-44 shrink-0 border-r border-white/5 overflow-y-auto custom-scrollbar">
                    <div className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">Libraries</div>
                    {jfLibraries.map(lib => (
                      <button
                        key={lib.Id}
                        onClick={() => setJfSelectedLib(lib)}
                        className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors ${
                          jfSelectedLib?.Id === lib.Id ? 'bg-primary/10 text-primary' : 'text-slate-300 hover:bg-white/5'
                        }`}
                      >
                        <Library className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{lib.Name}</span>
                      </button>
                    ))}
                  </div>
                )}

                {/* Artists column */}
                <div className="w-52 shrink-0 border-r border-white/5 overflow-y-auto custom-scrollbar">
                  <div className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">Artists</div>
                  {jfArtistsLoading ? (
                    <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
                  ) : jfArtists.length === 0 ? (
                    <p className="text-slate-500 text-xs px-3 py-4">No artists</p>
                  ) : jfArtists.map(artist => (
                    <button
                      key={artist.Id}
                      onClick={() => setJfSelectedArtist(artist)}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors ${
                        jfSelectedArtist?.Id === artist.Id ? 'bg-primary/10 text-primary' : 'text-slate-300 hover:bg-white/5'
                      }`}
                    >
                      {jfUrl && artist.ImageTags?.Primary ? (
                        <img src={`${jfUrl}/Items/${artist.Id}/Images/Primary?tag=${artist.ImageTags.Primary}&quality=80&maxWidth=48`} alt="" className="w-6 h-6 rounded-full object-cover shrink-0" />
                      ) : (
                        <Mic2 className="h-3.5 w-3.5 shrink-0 opacity-50" />
                      )}
                      <span className="truncate">{artist.Name}</span>
                      <ChevronRight className="h-3 w-3 ml-auto shrink-0 opacity-30" />
                    </button>
                  ))}
                </div>

                {/* Albums column */}
                <div className="w-56 shrink-0 border-r border-white/5 overflow-y-auto custom-scrollbar">
                  <div className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">Albums</div>
                  {!jfSelectedArtist ? (
                    <p className="text-slate-500 text-xs px-3 py-4">Select an artist</p>
                  ) : jfAlbumsLoading ? (
                    <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
                  ) : jfAlbums.length === 0 ? (
                    <p className="text-slate-500 text-xs px-3 py-4">No albums</p>
                  ) : jfAlbums.map(album => (
                    <button
                      key={album.Id}
                      onClick={() => setJfSelectedAlbum(album)}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors ${
                        jfSelectedAlbum?.Id === album.Id ? 'bg-primary/10 text-primary' : 'text-slate-300 hover:bg-white/5'
                      }`}
                    >
                      {jfUrl && album.ImageTags?.Primary ? (
                        <img src={`${jfUrl}/Items/${album.Id}/Images/Primary?tag=${album.ImageTags.Primary}&quality=80&maxWidth=64`} alt="" className="w-8 h-8 rounded object-cover shrink-0" />
                      ) : (
                        <Disc3 className="h-3.5 w-3.5 shrink-0 opacity-50" />
                      )}
                      <div className="min-w-0">
                        <p className="truncate text-left">{album.Name}</p>
                        {album.ProductionYear && <p className="text-xs text-slate-500">{album.ProductionYear}</p>}
                      </div>
                      <ChevronRight className="h-3 w-3 ml-auto shrink-0 opacity-30" />
                    </button>
                  ))}
                </div>

                {/* Tracks column */}
                <div className="flex-1 min-w-0 overflow-y-auto custom-scrollbar">
                  <div className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">Tracks</div>
                  {!jfSelectedAlbum ? (
                    <p className="text-slate-500 text-xs px-3 py-4">Select an album</p>
                  ) : jfTracksLoading ? (
                    <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
                  ) : jfTracks.length === 0 ? (
                    <p className="text-slate-500 text-xs px-3 py-4">No tracks</p>
                  ) : (
                    <div className="divide-y divide-white/5">
                      {jfTracks.map((track, i) => (
                        <div key={track.Id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-white/5 transition-colors group">
                          <span className="text-xs text-slate-600 w-5 text-right shrink-0">{i + 1}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-slate-200 truncate">{track.Name}</p>
                          </div>
                          {track.RunTimeTicks && (
                            <span className="text-xs text-slate-500 shrink-0">{formatDuration(Math.floor(track.RunTimeTicks / 10_000_000))}</span>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={!selectedGuild || jfPlayingId === track.Id}
                            onClick={() => handleJfPlay(track)}
                            className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-primary hover:text-primary hover:bg-primary/10"
                            title={!selectedGuild ? 'Select a guild first' : 'Play'}
                          >
                            {jfPlayingId === track.Id
                              ? <Loader2 className="h-4 w-4 animate-spin" />
                              : <Play className="h-4 w-4" />
                            }
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )
          )}

          {(activeTab === 'local' || activeTab === 'playlists') && (
            <div className="flex items-center justify-center h-full">
              <p className="text-slate-500 text-sm">{TABS.find(t => t.key === activeTab)?.label} — coming soon</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
