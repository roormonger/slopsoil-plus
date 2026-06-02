import { createContext, useContext, useState, useEffect, ReactNode } from 'react'

interface GuildContextType {
  selectedGuild: string
  selectedVoiceChannel: string
  setSelectedGuild: (guildId: string) => void
  setSelectedVoiceChannel: (channelId: string) => void
}

const GuildContext = createContext<GuildContextType | undefined>(undefined)

export function GuildProvider({ children }: { children: ReactNode }) {
  const [selectedGuild, setSelectedGuild] = useState(() => {
    return localStorage.getItem('lastSelectedGuild') || ''
  })
  const [selectedVoiceChannel, setSelectedVoiceChannel] = useState(() => {
    return localStorage.getItem('lastSelectedVoiceChannel') || ''
  })

  // Save to localStorage whenever selections change
  useEffect(() => {
    if (selectedGuild) {
      localStorage.setItem('lastSelectedGuild', selectedGuild)
    }
  }, [selectedGuild])

  useEffect(() => {
    if (selectedVoiceChannel) {
      localStorage.setItem('lastSelectedVoiceChannel', selectedVoiceChannel)
    }
  }, [selectedVoiceChannel])

  const handleSetSelectedGuild = (guildId: string) => {
    setSelectedGuild(guildId)
    // Clear voice channel when guild changes to avoid mismatch
    setSelectedVoiceChannel('')
    localStorage.removeItem('lastSelectedVoiceChannel')
  }

  const handleSetSelectedVoiceChannel = (channelId: string) => {
    setSelectedVoiceChannel(channelId)
  }

  return (
    <GuildContext.Provider value={{
      selectedGuild,
      selectedVoiceChannel,
      setSelectedGuild: handleSetSelectedGuild,
      setSelectedVoiceChannel: handleSetSelectedVoiceChannel
    }}>
      {children}
    </GuildContext.Provider>
  )
}

export function useGuild() {
  const context = useContext(GuildContext)
  if (context === undefined) {
    throw new Error('useGuild must be used within a GuildProvider')
  }
  return context
}
