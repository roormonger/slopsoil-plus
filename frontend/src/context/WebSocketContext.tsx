import { createContext, useContext, useEffect, useState } from 'react'
import { useWebSocket } from '../hooks/useWebSocket'
import type { BotStatus, NowPlaying, MusicStatus, VoiceStatus } from '../types'

interface WebSocketContextValue {
  connected: boolean
  botStatus: BotStatus | null
  nowPlaying: NowPlaying[]
  musicStatus: MusicStatus | null
  voiceState: VoiceStatus | null
}

const WebSocketContext = createContext<WebSocketContextValue>({
  connected: false,
  botStatus: null,
  nowPlaying: [],
  musicStatus: null,
  voiceState: null,
})

export function WebSocketProvider({ children }: { children: React.ReactNode }) {
  const { connected, lastEvent } = useWebSocket()
  const [botStatus, setBotStatus] = useState<BotStatus | null>(null)
  const [nowPlaying, setNowPlaying] = useState<NowPlaying[]>([])
  const [musicStatus, setMusicStatus] = useState<MusicStatus | null>(null)
  const [voiceState, setVoiceState] = useState<VoiceStatus | null>(null)

  useEffect(() => {
    if (!lastEvent) return

    const { type, data } = lastEvent

    switch (type) {
      case 'bot:status':
        setBotStatus(data as unknown as BotStatus)
        break
      case 'player:now-playing': {
        const payload = data as unknown as { streams: NowPlaying[]; count: number }
        setNowPlaying(payload.streams || [])
        break
      }
      case 'music:status': {
        const payload = data as unknown as MusicStatus | null
        setMusicStatus(payload)
        break
      }
      case 'voice:state':
        setVoiceState(data as unknown as VoiceStatus)
        break
    }
  }, [lastEvent])

  return (
    <WebSocketContext.Provider
      value={{ connected, botStatus, nowPlaying, musicStatus, voiceState }}
    >
      {children}
    </WebSocketContext.Provider>
  )
}

export function useWebSocketContext() {
  return useContext(WebSocketContext)
}
