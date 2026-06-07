import { useState, useEffect, useRef } from 'react'
import { PlayCircle, Film, Tv, Music, Book, Search, Clock, Star, Play, Plus, Bookmark, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { useApi } from '../hooks/useApi'
import { useGuild } from '../contexts/GuildContext'
import type { JellyfinItem, JellyfinLibrary, JellyfinItemType } from '../types'

const getItemIcon = (type: JellyfinItemType) => {
  switch (type) {
    case 'Movie': return <Film className="w-4 h-4" />
    case 'Series': return <Tv className="w-4 h-4" />
    case 'Episode': return <Tv className="w-4 h-4" />
    case 'MusicAlbum': return <Music className="w-4 h-4" />
    case 'MusicArtist': return <Music className="w-4 h-4" />
    case 'Book': return <Book className="w-4 h-4" />
    default: return <Film className="w-4 h-4" />
  }
}

const formatRuntime = (ticks?: number) => {
  if (!ticks) return 'N/A'
  const minutes = Math.floor(ticks / 600000000)
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`
}


export function Jellyfin() {
  const api = useApi()
  const { selectedGuild, selectedVoiceChannel } = useGuild()
  const [libraries, setLibraries] = useState<JellyfinLibrary[]>([])
  const [selectedLibrary, setSelectedLibrary] = useState<string>('')
  const [items, setItems] = useState<JellyfinItem[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState('Name')
  const [sortOrder, setSortOrder] = useState<'Ascending' | 'Descending'>('Ascending')
  const [loading, setLoading] = useState(true)
  const [config, setConfig] = useState<any>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalItems, setTotalItems] = useState(0)
  const [itemsLoading, setItemsLoading] = useState(false)
  const ITEMS_PER_PAGE = 50
  const LAST_LIB_KEY = 'jellyfin_last_library'
  const libScrollRef = useRef<HTMLDivElement>(null)

  const scrollLibsLeft = () => {
    if (libScrollRef.current) {
      libScrollRef.current.scrollBy({ left: -200, behavior: 'smooth' })
    }
  }

  const scrollLibsRight = () => {
    if (libScrollRef.current) {
      libScrollRef.current.scrollBy({ left: 200, behavior: 'smooth' })
    }
  }

  // Load config and check if Jellyfin is configured
  useEffect(() => {
    const loadConfig = async () => {
      const configData = await api.fetchConfig()
      if (configData) {
        setConfig(configData.settings)
        setLoading(false)
      }
    }
    loadConfig()
  }, [])

  
  // Load libraries when Jellyfin is configured
  useEffect(() => {
    if (!config?.jellyfin_url || !config?.jellyfin_api_key) return

    const loadLibraries = async () => {
      try {
        const librariesData = await api.fetchJellyfinLibraries()
        if (librariesData) {
          setLibraries(librariesData)
          const lastLib = localStorage.getItem(LAST_LIB_KEY)
          const match = librariesData.find((l: JellyfinLibrary) => l.Id === lastLib)
          if (match) {
            handleSelectLibrary(match.Id)
          } else if (librariesData.length > 0) {
            handleSelectLibrary(librariesData[0].Id)
          }
        }
      } catch (error) {
        console.error('Failed to load Jellyfin libraries:', error)
      }
    }
    loadLibraries()
  }, [config?.jellyfin_url, config?.jellyfin_api_key])

  // Load items when library is selected
  useEffect(() => {
    if (!selectedLibrary) return

    const loadItems = async () => {
      setItemsLoading(true)
      try {
        const itemsData = await api.fetchJellyfinItems(selectedLibrary, sortBy, sortOrder, searchQuery)
        if (itemsData) {
          setItems(itemsData)
          setTotalItems(itemsData.length)
          setCurrentPage(1) // Reset to first page when filters change
        }
      } catch (error) {
        console.error('Failed to load Jellyfin items:', error)
        setItems([])
        setTotalItems(0)
      } finally {
        setItemsLoading(false)
      }
    }
    loadItems()
  }, [selectedLibrary, sortBy, sortOrder, searchQuery])

  const handlePlayItem = async (item: JellyfinItem) => {
    if (!selectedGuild) return
    
    const itemName = item.Type === 'Episode' ? item.Name : item.Name
    await api.executeCommand(selectedGuild, 'media', itemName, selectedVoiceChannel)
  }

  const handleAddToQueue = async (item: JellyfinItem) => {
    if (!selectedGuild) return
    
    const itemName = item.Type === 'Episode' ? item.Name : item.Name
    await api.executeCommand(selectedGuild, 'queue', itemName, selectedVoiceChannel)
  }

  const handleBookmarkItem = async (item: JellyfinItem) => {
    if (!selectedGuild) return
    
    const itemName = item.Type === 'Episode' ? item.Name : item.Name
    await api.executeCommand(selectedGuild, 'bookmark', itemName)
  }

  const handleSelectLibrary = (id: string) => {
    localStorage.setItem(LAST_LIB_KEY, id)
    setSelectedLibrary(id)
  }

  // Show empty state if Jellyfin is not configured
  if (!loading && (!config?.jellyfin_url || !config?.jellyfin_api_key)) {
    return (
      <div className="space-y-6">
        <div className="mb-8">
          <h2 className="text-3xl font-bold gradient-text mb-2">Jellyfin</h2>
          <p className="text-slate-400">Browse your Jellyfin media library</p>
        </div>

        <div className="glass-card rounded-2xl p-8 text-center">
          <div className="w-16 h-16 rounded-2xl glass-light flex items-center justify-center mx-auto mb-6">
            <PlayCircle className="w-8 h-8 text-primary" />
          </div>
          <h3 className="text-2xl font-semibold text-slate-200 mb-3">Jellyfin Not Configured</h3>
          <p className="text-slate-400 max-w-md mx-auto mb-6">
            This page is empty because no Jellyfin client has been configured in settings.
          </p>
          <Button
            onClick={() => window.location.href = '/settings'}
            className="bg-primary/20 text-primary border border-primary/30 hover:bg-primary/30"
          >
            Configure Jellyfin
          </Button>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="mb-8">
          <h2 className="text-3xl font-bold gradient-text mb-2">Jellyfin</h2>
          <p className="text-slate-400">Browse your Jellyfin media library</p>
        </div>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
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

      <div className="shrink-0">
        <h2 className="text-3xl font-bold gradient-text mb-2">Jellyfin</h2>
        <p className="text-slate-400">Browse your Jellyfin media library</p>
      </div>

      
      {/* Libraries + Search + Filters — compact single card */}
      <div className="glass-card rounded-2xl p-4 shrink-0 space-y-3">
        {libraries.length === 0 ? (
          <div className="text-center py-2">
            <p className="text-slate-400 text-sm">No libraries found or unable to connect to Jellyfin.</p>
          </div>
        ) : (
          <>
            {/* Horizontal scrollable library pills */}
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={scrollLibsLeft}
                className="shrink-0 h-8 w-8 p-0 text-slate-400 hover:text-white hover:bg-white/10"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div
                ref={libScrollRef}
                className="flex gap-2 overflow-x-auto scrollbar-hide"
                style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
              >
                {libraries.map((library) => (
                  <button
                    key={library.Id}
                    onClick={() => handleSelectLibrary(library.Id)}
                    className={`px-4 py-2 rounded-lg text-sm whitespace-nowrap transition-colors shrink-0 ${
                      selectedLibrary === library.Id
                        ? 'bg-primary/20 text-primary border border-primary/30'
                        : 'glass-light border-white/10 text-slate-300 hover:bg-white/10'
                    }`}
                  >
                    {library.Name}
                  </button>
                ))}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={scrollLibsRight}
                className="shrink-0 h-8 w-8 p-0 text-slate-400 hover:text-white hover:bg-white/10"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            {/* Search + Filters row */}
            {selectedLibrary && (
              <div className="flex gap-3">
                <div className="relative flex-1 min-w-0">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search media..."
                    className="pl-10 glass-input text-slate-200"
                  />
                </div>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="h-10 px-3 rounded-xl glass-input text-sm text-slate-200 outline-none focus:ring-2 focus:ring-primary/50 shrink-0"
                >
                  <option value="Name">Name</option>
                  <option value="ProductionYear">Year</option>
                  <option value="PremiereDate">Date Added</option>
                  <option value="CommunityRating">Rating</option>
                  <option value="RunTimeTicks">Runtime</option>
                </select>
                <select
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value as 'Ascending' | 'Descending')}
                  className="h-10 px-3 rounded-xl glass-input text-sm text-slate-200 outline-none focus:ring-2 focus:ring-primary/50 shrink-0"
                >
                  <option value="Ascending">A-Z</option>
                  <option value="Descending">Z-A</option>
                </select>
              </div>
            )}
          </>
        )}
      </div>

      {/* Items List */}
      {selectedLibrary && (
        <div className="glass-card rounded-2xl overflow-hidden flex-1 min-h-0 flex flex-col">
          <div className="flex items-center justify-end p-4 pb-0 shrink-0">
            <div className="text-sm text-slate-400">
              {totalItems} items
            </div>
          </div>
          
          <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-4 py-2">
            {itemsLoading ? (
              <div className="flex flex-col items-center justify-center h-full gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm text-slate-400">Loading items…</p>
              </div>
            ) : items.length === 0 ? (
              <div className="text-center py-8">
                <Film className="w-12 h-12 text-slate-500 mx-auto mb-3" />
                <p className="text-slate-400">
                  {searchQuery ? 'No items found matching your search.' : 'No items found in this library.'}
                </p>
              </div>
            ) : (
              <div className="space-y-2 pb-4">
                {items
                  .slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE)
                  .map((item) => (
                    <div key={item.Id} className="glass-light rounded-lg p-3 hover:bg-white/5 transition-colors group">
                      <div className="flex items-center gap-4">
                        {/* Poster on left */}
                        <div className="flex-shrink-0 w-16 h-20 bg-slate-700 rounded-md overflow-hidden">
                          {item.ImageTags?.Primary ? (
                            <img
                              src={`${config.jellyfin_url}/Items/${item.Id}/Images/Primary?tag=${item.ImageTags.Primary}&quality=90&maxWidth=100&maxHeight=150`}
                              alt={item.Name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-slate-500">
                              {getItemIcon(item.Type)}
                            </div>
                          )}
                        </div>

                        {/* Metadata in center */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-medium text-slate-200 text-sm truncate">{item.Name}</h4>
                            {/* Status indicators */}
                            {item.UserData?.Played && (
                              <div className="w-2 h-2 bg-emerald-500 rounded-full flex-shrink-0" />
                            )}
                            {item.UserData?.IsFavorite && (
                              <Star className="w-3 h-3 text-yellow-400 fill-yellow-400 flex-shrink-0" />
                            )}
                          </div>
                          
                          <div className="flex items-center gap-3 text-xs text-slate-400">
                            {item.ProductionYear && <span>{item.ProductionYear}</span>}
                            {item.Type && <span className="text-slate-500">{item.Type}</span>}
                            {item.CommunityRating && (
                              <div className="flex items-center gap-1">
                                <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
                                <span>{item.CommunityRating.toFixed(1)}</span>
                              </div>
                            )}
                            {item.RunTimeTicks && (
                              <div className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                <span>{formatRuntime(item.RunTimeTicks)}</span>
                              </div>
                            )}
                          </div>
                          
                          {item.Overview && (
                            <p className="text-xs text-slate-500 mt-1 line-clamp-2">{item.Overview}</p>
                          )}
                        </div>

                        {/* Action buttons on right */}
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <Button
                            size="sm"
                            onClick={() => handlePlayItem(item)}
                            className="bg-primary/20 text-primary border border-primary/30 hover:bg-primary/30 h-8 w-8 p-0"
                            title="Play"
                          >
                            <Play className="w-3 h-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleAddToQueue(item)}
                            className="glass-light border-white/10 text-slate-300 hover:bg-white/10 h-8 w-8 p-0"
                            title="Add to queue"
                          >
                            <Plus className="w-3 h-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleBookmarkItem(item)}
                            className="glass-light border-white/10 text-slate-300 hover:bg-white/10 h-8 w-8 p-0"
                            title="Bookmark"
                          >
                            <Bookmark className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>
          
          {items.length > 0 && totalItems > ITEMS_PER_PAGE && (
            <div className="flex items-center justify-center gap-2 p-6 pt-2 shrink-0">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
                className="glass-light border-white/10 text-slate-300 hover:bg-white/10 disabled:opacity-50"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              
              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(5, Math.ceil(totalItems / ITEMS_PER_PAGE)) }, (_, i) => {
                  const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE)
                  let startPage = Math.max(1, currentPage - 2)
                  let endPage = Math.min(totalPages, startPage + 4)
                  
                  if (endPage - startPage < 4) {
                    startPage = Math.max(1, endPage - 4)
                  }
                  
                  const pageNum = startPage + i
                  if (pageNum > totalPages) return null
                  
                  return (
                    <Button
                      key={pageNum}
                      size="sm"
                      variant={currentPage === pageNum ? "default" : "outline"}
                      onClick={() => setCurrentPage(pageNum)}
                      className={`${
                        currentPage === pageNum
                          ? 'bg-primary/20 text-primary border border-primary/30'
                          : 'glass-light border-white/10 text-slate-300 hover:bg-white/10'
                      } h-8 w-8 p-0`}
                    >
                      {pageNum}
                    </Button>
                  )
                })}
              </div>
              
              <Button
                size="sm"
                variant="outline"
                onClick={() => setCurrentPage(Math.min(Math.ceil(totalItems / ITEMS_PER_PAGE), currentPage + 1))}
                disabled={currentPage === Math.ceil(totalItems / ITEMS_PER_PAGE)}
                className="glass-light border-white/10 text-slate-300 hover:bg-white/10 disabled:opacity-50"
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
