import { useState, useEffect } from 'react'
import { PlayCircle, Film, Tv, Music, Book, Search, Clock, Star, Play, Plus, Bookmark, ChevronLeft, ChevronRight } from 'lucide-react'
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
  const { selectedGuild } = useGuild()
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
  const ITEMS_PER_PAGE = 50

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
        if (librariesData) setLibraries(librariesData)
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
      }
    }
    loadItems()
  }, [selectedLibrary, sortBy, sortOrder, searchQuery])

  const handlePlayItem = async (item: JellyfinItem) => {
    if (!selectedGuild) return
    
    const itemName = item.Type === 'Episode' ? item.Name : item.Name
    await api.executeCommand(selectedGuild, 'media', itemName)
  }

  const handleAddToQueue = async (item: JellyfinItem) => {
    if (!selectedGuild) return
    
    const itemName = item.Type === 'Episode' ? item.Name : item.Name
    await api.executeCommand(selectedGuild, 'queue', itemName)
  }

  const handleBookmarkItem = async (item: JellyfinItem) => {
    if (!selectedGuild) return
    
    const itemName = item.Type === 'Episode' ? item.Name : item.Name
    await api.executeCommand(selectedGuild, 'bookmark', itemName)
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
    <div className="space-y-6">
      {/* Error/Success Messages */}
      {api.error && (
        <div className="p-4 glass-card border-red-400/30 text-red-300 rounded-xl">{api.error}</div>
      )}
      {api.success && (
        <div className="p-4 glass-card border-emerald-400/30 text-emerald-300 rounded-xl">{api.success}</div>
      )}

      <div className="mb-8">
        <h2 className="text-3xl font-bold gradient-text mb-2">Jellyfin</h2>
        <p className="text-slate-400">Browse your Jellyfin media library</p>
      </div>

      
      {/* Library Selection */}
      <div className="glass-card rounded-2xl p-6">
        <h3 className="text-xl font-semibold text-slate-200 mb-4">Libraries</h3>
        {libraries.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-slate-400">No libraries found or unable to connect to Jellyfin.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {libraries.map((library) => (
              <Button
                key={library.Id}
                variant={selectedLibrary === library.Id ? "default" : "outline"}
                onClick={() => setSelectedLibrary(library.Id)}
                className={`h-20 flex flex-col items-center justify-center gap-2 ${
                  selectedLibrary === library.Id
                    ? 'bg-primary/20 text-primary border border-primary/30'
                    : 'glass-light border-white/10 text-slate-300 hover:bg-white/10'
                }`}
              >
                <div className="text-2xl">
                  {library.CollectionType === 'movies' ? <Film className="w-6 h-6" /> :
                   library.CollectionType === 'tvshows' ? <Tv className="w-6 h-6" /> :
                   library.CollectionType === 'music' ? <Music className="w-6 h-6" /> :
                   library.CollectionType === 'books' ? <Book className="w-6 h-6" /> :
                   <PlayCircle className="w-6 h-6" />}
                </div>
                <span className="text-xs font-medium text-center">{library.Name}</span>
              </Button>
            ))}
          </div>
        )}
      </div>

      {/* Search and Filters */}
      {selectedLibrary && (
        <div className="glass-card rounded-2xl p-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search media..."
                  className="pl-10 glass-input text-slate-200"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="h-10 px-3 rounded-xl glass-input text-sm text-slate-200 outline-none focus:ring-2 focus:ring-primary/50"
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
                className="h-10 px-3 rounded-xl glass-input text-sm text-slate-200 outline-none focus:ring-2 focus:ring-primary/50"
              >
                <option value="Ascending">A-Z</option>
                <option value="Descending">Z-A</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Items List */}
      {selectedLibrary && (
        <div className="glass-card rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-semibold text-slate-200">
              {libraries.find(l => l.Id === selectedLibrary)?.Name || 'Media'}
            </h3>
            <div className="text-sm text-slate-400">
              {totalItems} items
            </div>
          </div>
          
          {items.length === 0 ? (
            <div className="text-center py-8">
              <Film className="w-12 h-12 text-slate-500 mx-auto mb-3" />
              <p className="text-slate-400">
                {searchQuery ? 'No items found matching your search.' : 'No items found in this library.'}
              </p>
            </div>
          ) : (
            <>
              {/* Compact List View */}
              <div className="space-y-2 mb-6">
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

              {/* Pagination */}
              {totalItems > ITEMS_PER_PAGE && (
                <div className="flex items-center justify-center gap-2">
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
            </>
          )}
        </div>
      )}
    </div>
  )
}
