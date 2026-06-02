import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { Loader2 } from 'lucide-react'
import { Layout } from './components/Layout'
import TopNavigation from './components/TopNavigation'
import { GuildProvider } from './contexts/GuildContext'
import { Dashboard } from './pages/Dashboard'
import { Users } from './pages/Users'
import { Iptv } from './pages/Iptv'
import { Bookmarks } from './pages/Bookmarks'
import { Settings } from './pages/Settings'
import { Soundboard } from './pages/Soundboard'
import { Music } from './pages/Music'
import { Jellyfin } from './pages/Jellyfin'
import type { BotStatus } from './types'

const API_URL = '/api'

function AppContent() {
  const navigate = useNavigate()
  const [status, setStatus] = useState<BotStatus | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchStatus = async () => {
    try {
      const res = await fetch(`${API_URL}/bot/status`)
      if (!res.ok) throw new Error('Failed to fetch status')
      const data = await res.json()
      setStatus(data)
    } catch (err) {
      console.error('Failed to load status:', err)
    }
  }

  useEffect(() => {
    const init = async () => {
      await fetchStatus()
      setLoading(false)
    }
    init()

    // Refresh status every 5 seconds
    const interval = setInterval(() => {
      fetchStatus()
    }, 5000)
    return () => clearInterval(interval)
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <>
      <TopNavigation onNavigate={(page: string) => navigate(`/${page === 'dashboard' ? '' : page}`)} />
      <Layout status={status}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/users" element={<Users />} />
          <Route path="/iptv" element={<Iptv />} />
          <Route path="/bookmarks" element={<Bookmarks />} />
          <Route path="/jellyfin" element={<Jellyfin />} />
          <Route path="/soundboard" element={<Soundboard />} />
          <Route path="/music" element={<Music />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </Layout>
    </>
  )
}

function App() {
  return (
    <BrowserRouter>
      <GuildProvider>
        <AppContent />
      </GuildProvider>
    </BrowserRouter>
  )
}

export default App
