import { useState, useEffect } from 'react'
import { Loader2, Tv, Bookmark, PlayCircle, Volume2, Play, Star, Film, Music, Book, Clock } from 'lucide-react'
import { Button } from '../components/ui/button'
import { useApi } from '../hooks/useApi'
import { useAuth } from '../context/AuthContext'
import { useGuild } from '../contexts/GuildContext'
import type { FeaturedSettings, Sound } from '../types'

const getItemIcon = (type: string) => {
  switch (type) {
    case 'Movie': return <Film className="w-4 h-4" />
    case 'Series': case 'Season': case 'Episode': return <Tv className="w-4 h-4" />
    case 'MusicAlbum': case 'MusicArtist': return <Music className="w-4 h-4" />
    case 'Book': return <Book className="w-4 h-4" />
    default: return <Film className="w-4 h-4" />
  }
}

const formatRuntime = (ticks?: number) => {
  if (!ticks) return null
  const minutes = Math.floor(ticks / 600000000)
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`
}

interface FeaturedSection {
  key: keyof FeaturedSettings
  category: string
  label: string
  icon: typeof Tv
  command: string
}

const SECTIONS: FeaturedSection[] = [
  { key: 'iptv',       category: 'iptv',       label: 'IPTV',       icon: Tv,         command: 'tv' },
  { key: 'bookmarks',  category: 'bookmark',   label: 'Bookmarks',  icon: Bookmark,   command: 'bm' },
  { key: 'jellyfin',   category: 'jellyfin',   label: 'Jellyfin',   icon: PlayCircle, command: 'jf' },
  { key: 'soundboard', category: 'soundboard', label: 'Soundboard', icon: Volume2,    command: 'sb' },
]

export function Dashboard() {
  const api = useApi()
  const { user } = useAuth()
  const { selectedGuild, selectedVoiceChannel } = useGuild()
  const isAdmin = user?.role === 'admin'

  const [settings, setSettings] = useState<FeaturedSettings>({ iptv: true, bookmarks: true, jellyfin: true, soundboard: true })
  const [featured, setFeatured] = useState<Record<string, string[]>>({ iptv: [], bookmark: [], jellyfin: [], soundboard: [] })
  const [systemSounds, setSystemSounds] = useState<Sound[]>([])
  const [jellyfinItems, setJellyfinItems] = useState<any[]>([])
  const [jellyfinConfig, setJellyfinConfig] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const loadAll = async () => {
      const [settingsData, iptvData, bmData, jfData, sbData, soundsData] = await Promise.all([
        api.fetchFeaturedSettings(),
        api.fetchFeatured('iptv'),
        api.fetchFeatured('bookmark'),
        api.fetchFeatured('jellyfin'),
        api.fetchFeatured('soundboard'),
        api.fetchSystemSounds(),
      ])
      if (cancelled) return
      if (settingsData) setSettings(settingsData)
      if (soundsData) setSystemSounds(soundsData)
      const jfNames = jfData?.items ?? []
      setFeatured({
        iptv:       iptvData?.items ?? [],
        bookmark:   bmData?.items   ?? [],
        jellyfin:   jfNames,
        soundboard: sbData?.items   ?? [],
      })
      if (jfNames.length > 0) {
        const [jfItemsData, configData] = await Promise.all([
          api.fetchJellyfinByNames(jfNames),
          api.fetchConfig(),
        ])
        if (jfItemsData) setJellyfinItems(jfItemsData)
        if (configData) setJellyfinConfig(configData.settings)
      }
      setLoading(false)
    }
    loadAll()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handlePlay = async (command: string, itemId: string) => {
    if (!selectedGuild || !selectedVoiceChannel) return
    await api.executeCommand(selectedGuild, command, itemId, selectedVoiceChannel)
  }

  const handleUnfeature = async (category: string, itemId: string) => {
    await api.toggleFeatured(category, itemId)
    setFeatured(prev => ({ ...prev, [category]: prev[category].filter(id => id !== itemId) }))
  }

  const renderJellyfinRows = (names: string[]) => {
    const itemMap = new Map(jellyfinItems.map((i: any) => [i.Name, i]))
    const canPlay = !!selectedGuild && !!selectedVoiceChannel

    return (
      <div className="space-y-2">
        {names.map(name => {
          const item = itemMap.get(name)
          return (
            <div key={name} className="glass-light rounded-lg p-3 hover:bg-white/5 transition-colors group">
              <div className="flex items-center gap-4">
                <div className="flex-shrink-0 w-16 h-20 bg-slate-700 rounded-md overflow-hidden">
                  {item?.ImageTags?.Primary && jellyfinConfig?.jellyfin_url ? (
                    <img
                      src={`${jellyfinConfig.jellyfin_url}/Items/${item.Id}/Images/Primary?tag=${item.ImageTags.Primary}&quality=90&maxWidth=100&maxHeight=150`}
                      alt={item.Name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-500">
                      {item ? getItemIcon(item.Type) : <PlayCircle className="w-4 h-4" />}
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-medium text-slate-200 text-sm truncate">{item?.Name ?? name}</h4>
                    {item?.UserData?.Played && <div className="w-2 h-2 bg-emerald-500 rounded-full flex-shrink-0" />}
                    {item?.UserData?.IsFavorite && <Star className="w-3 h-3 text-yellow-400 fill-yellow-400 flex-shrink-0" />}
                  </div>
                  {item && (
                    <div className="flex items-center gap-3 text-xs text-slate-400">
                      {item.ProductionYear && <span>{item.ProductionYear}</span>}
                      {item.Type && <span className="text-slate-500">{item.Type}</span>}
                      {item.CommunityRating && (
                        <div className="flex items-center gap-1">
                          <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
                          <span>{item.CommunityRating.toFixed(1)}</span>
                        </div>
                      )}
                      {item.RunTimeTicks && formatRuntime(item.RunTimeTicks) && (
                        <div className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          <span>{formatRuntime(item.RunTimeTicks)}</span>
                        </div>
                      )}
                    </div>
                  )}
                  {item?.Overview && <p className="text-xs text-slate-500 mt-1 line-clamp-2">{item.Overview}</p>}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {isAdmin && (
                    <button
                      onClick={() => handleUnfeature('jellyfin', name)}
                      className="p-1.5 rounded-lg transition-colors text-yellow-400 hover:text-yellow-300 hover:bg-yellow-500/10"
                      title="Remove from featured"
                    >
                      <Star className="w-4 h-4 fill-current" />
                    </button>
                  )}
                  <Button
                    size="sm"
                    onClick={() => canPlay && handlePlay('jf', name)}
                    disabled={!canPlay}
                    className="bg-primary/20 text-primary border border-primary/30 hover:bg-primary/30 h-8 w-8 p-0"
                    title={!selectedGuild ? 'Select a guild first' : !selectedVoiceChannel ? 'Select a voice channel first' : 'Play'}
                  >
                    <Play className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  const getCoverUrl = (filename: string) => {
    const token = localStorage.getItem('slopsoil_token') || ''
    const base = `/api/soundboard/system/${encodeURIComponent(filename)}/cover`
    return token ? `${base}?token=${token}` : base
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  const activeSections = SECTIONS.filter(s => settings[s.key])

  const renderSoundboardCards = (filenames: string[]) => {
    const canPlay = !!selectedGuild && !!selectedVoiceChannel
    const soundMap = new Map(systemSounds.map(s => [s.filename, s]))

    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {filenames.map(filename => {
          const sound = soundMap.get(filename)
          const displayName = sound?.name ?? filename

          return (
            <div
              key={filename}
              onClick={() => canPlay && handlePlay('sb', filename)}
              title={
                !selectedGuild ? 'Select a guild first' :
                !selectedVoiceChannel ? 'Select a voice channel first' :
                `Play ${displayName}`
              }
              className={`glass-light rounded-lg p-3 flex items-center gap-3 transition-all ${
                canPlay
                  ? 'cursor-pointer hover:bg-white/10 hover:scale-[1.01] active:scale-[0.99]'
                  : 'cursor-not-allowed opacity-60'
              }`}
            >
              {/* Cover art */}
              <div className="shrink-0 w-12 h-12 rounded-md overflow-hidden bg-slate-700/50 flex items-center justify-center">
                {sound?.has_cover_art ? (
                  <img
                    src={getCoverUrl(filename)}
                    alt=""
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none'
                      e.currentTarget.nextElementSibling?.removeAttribute('style')
                    }}
                  />
                ) : null}
                <Volume2 className={`w-5 h-5 text-slate-500 ${sound?.has_cover_art ? 'hidden' : ''}`} />
              </div>

              {/* Title + tags */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-200 truncate" title={displayName}>
                  {displayName}
                </p>
                {sound && sound.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {sound.tags.map(tag => (
                      <span key={tag} className="text-xs px-1.5 py-0.5 rounded-full bg-primary/20 text-primary">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Featured star — admin can unfeature from here */}
              {isAdmin && (
                <button
                  onClick={(e) => { e.stopPropagation(); handleUnfeature('soundboard', filename) }}
                  className="shrink-0 p-1 rounded transition-colors text-yellow-400 hover:text-yellow-300"
                  title="Remove from featured"
                >
                  <Star className="w-3.5 h-3.5 fill-current" />
                </button>
              )}
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {api.error && (
        <div className="p-4 glass-card border-red-400/30 text-red-300 rounded-xl">{api.error}</div>
      )}
      {api.success && (
        <div className="p-4 glass-card border-emerald-400/30 text-emerald-300 rounded-xl">{api.success}</div>
      )}

      <div className="mb-8">
        <h2 className="text-3xl font-bold gradient-text mb-2">Dashboard</h2>
        <p className="text-slate-400">Featured media — quick access to your pinned content</p>
      </div>

      {activeSections.length === 0 ? (
        <div className="glass-card rounded-2xl p-12 text-center">
          <Star className="w-12 h-12 text-slate-500 mx-auto mb-3" />
          <p className="text-slate-400">No featured sections are enabled.</p>
          <p className="text-slate-500 text-sm mt-1">Enable sections in Settings → Featured Sections.</p>
        </div>
      ) : (
        activeSections.map(section => {
          const Icon = section.icon
          const items = featured[section.category] ?? []
          const isSoundboard = section.key === 'soundboard'

          return (
            <div key={section.key} className="glass-card rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-4">
                <Icon className="w-5 h-5 text-primary" />
                <h3 className="text-lg font-semibold text-slate-200">{section.label}</h3>
                <span className="text-xs text-slate-500 ml-1">({items.length} featured)</span>
              </div>

              {items.length === 0 ? (
                <div className="p-6 text-center glass-light rounded-xl">
                  <Icon className="w-8 h-8 text-slate-500 mx-auto mb-2" />
                  <p className="text-slate-400 text-sm">No featured {section.label.toLowerCase()} yet.</p>
                  <p className="text-slate-500 text-xs mt-1">
                    Star items in the {section.label} page to feature them here.
                  </p>
                </div>
              ) : isSoundboard ? (
                renderSoundboardCards(items)
              ) : section.key === 'jellyfin' ? (
                renderJellyfinRows(items)
              ) : (
                <div className="divide-y divide-white/5">
                  {items.map(itemId => (
                    <div key={itemId} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                      <p className="text-slate-200 font-medium truncate flex-1 mr-4">{itemId}</p>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handlePlay(section.command, itemId)}
                          disabled={!selectedGuild || !selectedVoiceChannel}
                          className="text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10"
                          title={!selectedGuild ? 'Select a guild first' : !selectedVoiceChannel ? 'Select a voice channel first' : 'Play'}
                        >
                          <Play className="h-4 w-4" />
                        </Button>
                        {isAdmin && (
                          <button
                            onClick={() => handleUnfeature(section.category, itemId)}
                            className="p-1.5 rounded-lg text-yellow-400 hover:text-yellow-300 hover:bg-yellow-500/10 transition-colors"
                            title="Remove from featured"
                          >
                            <Star className="w-4 h-4 fill-current" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })
      )}
    </div>
  )
}
