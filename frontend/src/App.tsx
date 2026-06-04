import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom'
import { Layout } from './components/Layout'
import TopNavigation from './components/TopNavigation'
import { GuildProvider } from './contexts/GuildContext'
import { AuthProvider } from './context/AuthContext'
import { WebSocketProvider } from './context/WebSocketContext'
import ProtectedRoute from './components/ProtectedRoute'
import { Dashboard } from './pages/Dashboard'
import { Users } from './pages/Users'
import { Iptv } from './pages/Iptv'
import { Bookmarks } from './pages/Bookmarks'
import { Settings } from './pages/Settings'
import { Soundboard } from './pages/Soundboard'
import { Music } from './pages/Music'
import { Jellyfin } from './pages/Jellyfin'
import Login from './pages/Login'

function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate()

  return (
    <>
      <TopNavigation onNavigate={(page: string) => navigate(`/${page === 'dashboard' ? '' : page}`)} />
      <Layout>
        {children}
      </Layout>
    </>
  )
}

function AppContent() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <AuthenticatedLayout>
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
            </AuthenticatedLayout>
          </ProtectedRoute>
        }
      />
    </Routes>
  )
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <GuildProvider>
          <WebSocketProvider>
            <AppContent />
          </WebSocketProvider>
        </GuildProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
