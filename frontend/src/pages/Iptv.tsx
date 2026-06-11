import { useState, useEffect, useRef, useMemo } from 'react'
import { Loader2, Play, ArrowLeft, Star, Search, ChevronLeft, ChevronRight, Tv } from 'lucide-react'
import { LazyChannelImage } from '../components/LazyChannelImage'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { useApi } from '../hooks/useApi'
import { useAuth } from '../context/AuthContext'
import { useGuild } from '../contexts/GuildContext'
import type { IptvSource, IptvChannel } from '../types'

const LAST_CAT_KEY = (source: string) => `iptv_last_cat_${source}`

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
  const [selectedCategory, setSelectedCategory] = useState<string>('All')
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState<'name' | 'channel_number'>('name')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')
  const catScrollRef = useRef<HTMLDivElement>(null)

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

  const categories = useMemo(() => {
    const groups = Array.from(new Set(channels.map(c => c.group ?? '').filter(Boolean))).sort()
    return ['All', ...groups]
  }, [channels])

  const filteredChannels = useMemo(() => {
    let list = channels
    if (selectedCategory !== 'All') list = list.filter(c => c.group === selectedCategory)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      list = list.filter(c => c.name.toLowerCase().includes(q))
    }
    list = [...list].sort((a, b) => {
      let cmp = 0
      if (sortBy === 'name') {
        cmp = a.name.localeCompare(b.name)
      } else {
        const na = parseFloat(a.tvg_id ?? '')
        const nb = parseFloat(b.tvg_id ?? '')
        if (!isNaN(na) && !isNaN(nb)) cmp = na - nb
        else if (!isNaN(na)) cmp = -1
        else if (!isNaN(nb)) cmp = 1
        else cmp = (a.tvg_id ?? '').localeCompare(b.tvg_id ?? '')
      }
      return sortOrder === 'asc' ? cmp : -cmp
    })
    return list
  }, [channels, selectedCategory, searchQuery, sortBy, sortOrder])

  const handleViewChannels = async (sourceName: string) => {
    setSelectedSource(sourceName)
    setChannelsLoading(true)
    setView('channels')
    setSearchQuery('')
    setSortBy('name')
    setSortOrder('asc')
    const saved = localStorage.getItem(LAST_CAT_KEY(sourceName)) ?? 'All'
    setSelectedCategory(saved)
    const data = await api.fetchIptvChannels(sourceName)
    if (data) setChannels(data)
    setChannelsLoading(false)
  }

  const handleBack = () => {
    setView('list')
    setSelectedSource('')
    setChannels([])
    setSelectedCategory('All')
    setSearchQuery('')
  }

  const handleSelectCategory = (cat: string) => {
    setSelectedCategory(cat)
    localStorage.setItem(LAST_CAT_KEY(selectedSource), cat)
  }

  const handleToggleFeatured = async (ch: IptvChannel) => {
    const metadata = { name: ch.name, logo_url: ch.logo_url ?? null, group: ch.group ?? null }
    const result = await api.toggleFeatured('iptv', ch.name, metadata)
    if (result !== null) {
      setFeaturedIds(prev => {
        const next = new Set(prev)
        if (result.featured) next.add(ch.name)
        else next.delete(ch.name)
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 h-[calc(100vh-8rem)]">
      {api.error && <div className="p-4 glass-card border-red-400/30 text-red-300 rounded-xl shrink-0">{api.error}</div>}
      {api.success && <div className="p-4 glass-card border-emerald-400/30 text-emerald-300 rounded-xl shrink-0">{api.success}</div>}

      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          {view === 'channels' && (
            <Button variant="ghost" size="sm" onClick={handleBack} className="text-slate-300 hover:text-white hover:bg-white/10">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
          )}
          <div>
            <h2 className="text-3xl font-bold gradient-text">
              {view === 'list' ? 'IPTV Sources' : selectedSource}
            </h2>
            <p className="text-slate-400">
              {view === 'list' ? 'Manage M3U playlist sources' : `${filteredChannels.length} / ${channels.length} channels`}
            </p>
          </div>
        </div>
      </div>

      {/* Top container — sources list stays static; channel view gets category scroller + search/sort */}
      <div className="glass-card rounded-2xl p-4 shrink-0 space-y-3">
        {view === 'channels' ? (
          <>
            {/* Category horizontal scroller */}
            {categories.length > 1 && (
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm"
                  onClick={() => catScrollRef.current?.scrollBy({ left: -200, behavior: 'smooth' })}
                  className="shrink-0 h-8 w-8 p-0 text-slate-400 hover:text-white hover:bg-white/10">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <div ref={catScrollRef} className="flex gap-2 overflow-x-auto" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', maxWidth: 'calc(100% - 4rem)' }}>
                  {categories.map(cat => (
                    <button
                      key={cat}
                      onClick={() => handleSelectCategory(cat)}
                      className={`px-4 py-1.5 rounded-lg text-sm whitespace-nowrap transition-colors shrink-0 ${
                        selectedCategory === cat
                          ? 'bg-primary/20 text-primary border border-primary/30'
                          : 'glass-light border-white/10 text-slate-300 hover:bg-white/10'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
                <Button variant="ghost" size="sm"
                  onClick={() => catScrollRef.current?.scrollBy({ left: 200, behavior: 'smooth' })}
                  className="shrink-0 h-8 w-8 p-0 text-slate-400 hover:text-white hover:bg-white/10">
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}

            {/* Search + sort */}
            <div className="flex gap-3">
              <div className="relative flex-1 min-w-0">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search channels…"
                  className="pl-10 h-10 glass-input text-slate-200"
                />
              </div>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as 'name' | 'channel_number')}
                className="h-10 px-3 rounded-xl glass-input text-sm text-slate-200 outline-none focus:ring-2 focus:ring-primary/50 shrink-0"
              >
                <option value="name">Name</option>
                <option value="channel_number">Channel #</option>
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
          </>
        ) : (
          <p className="text-sm text-slate-400">
            {sources.length === 0 ? 'No sources added yet.' : `${sources.length} source${sources.length !== 1 ? 's' : ''} configured`}
          </p>
        )}
      </div>

      {/* Main list */}
      <div className="glass-card rounded-2xl overflow-hidden flex-1 min-h-0">
        <div className="divide-y divide-white/5 h-full overflow-y-auto custom-scrollbar">
          {view === 'list' ? (
            sources.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 p-8">
                <Tv className="w-12 h-12 text-slate-500" />
                <p className="text-slate-400">No IPTV sources configured</p>
              </div>
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
                </div>
              ))
            )
          ) : channelsLoading ? (
            <div className="flex flex-col items-center justify-center h-full gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-slate-400">Loading channels…</p>
            </div>
          ) : filteredChannels.length === 0 ? (
            <div className="p-8 text-center text-slate-400">
              {channels.length === 0 ? 'No channels found in this source' : 'No channels match your search'}
            </div>
          ) : (
            filteredChannels.map((ch, idx) => (
              <div key={`${ch.name}-${idx}`} className="flex items-center justify-between p-3 hover:bg-white/5 transition-colors">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <LazyChannelImage src={ch.logo_url} alt={ch.name} className="w-10 h-10 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="font-medium text-slate-200 truncate">{ch.name}</p>
                    {ch.tvg_id && (
                      <span className="text-xs text-slate-500 truncate">{ch.tvg_id}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 ml-4">
                  {isAdmin && (
                    <button
                      onClick={() => handleToggleFeatured(ch)}
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
                    variant="ghost" size="sm"
                    onClick={() => handlePlay(ch.name)}
                    disabled={!selectedGuild || !selectedVoiceChannel}
                    className="text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10"
                    title={!selectedGuild ? 'Select a guild first' : !selectedVoiceChannel ? 'Select a voice channel first' : 'Play'}
                  >
                    <Play className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
