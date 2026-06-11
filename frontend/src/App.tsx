import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom'
import { Layout } from './components/Layout'
import TopNavigation from './components/TopNavigation'
import { GuildProvider } from './contexts/GuildContext'
import { AuthProvider } from './context/AuthContext'
import { WebSocketProvider } from './context/WebSocketContext'
import ProtectedRoute from './components/ProtectedRoute'
import AdminRoute from './components/AdminRoute'
import { Dashboard } from './pages/Dashboard'
import { Users } from './pages/Users'
import { Iptv } from './pages/Iptv'
import { Bookmarks } from './pages/Bookmarks'
import { Settings } from './pages/Settings'
import { Soundboard } from './pages/Soundboard'
import { SoundboardManager } from './pages/SoundboardManager'
import { Audio } from './pages/Audio'
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
      {/* Admin-only routes */}
      <Route
        path="/users"
        element={
          <AdminRoute>
            <AuthenticatedLayout>
              <Users />
            </AuthenticatedLayout>
          </AdminRoute>
        }
      />
      <Route
        path="/soundboard-manager"
        element={
          <AdminRoute>
            <AuthenticatedLayout>
              <SoundboardManager />
            </AuthenticatedLayout>
          </AdminRoute>
        }
      />
      <Route
        path="/settings"
        element={
          <AdminRoute>
            <AuthenticatedLayout>
              <Settings />
            </AuthenticatedLayout>
          </AdminRoute>
        }
      />
      {/* Regular authenticated routes */}
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <AuthenticatedLayout>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/iptv" element={<Iptv />} />
                <Route path="/bookmarks" element={<Bookmarks />} />
                <Route path="/jellyfin" element={<Jellyfin />} />
                <Route path="/soundboard" element={<Soundboard />} />
                <Route path="/audio" element={<Audio />} />
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
