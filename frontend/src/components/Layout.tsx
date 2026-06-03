import { Link, useLocation } from 'react-router-dom'
import { LayoutDashboard, Users, Settings, Tv, Bookmark, Volume2, Music, PlayCircle, LogOut, User } from 'lucide-react'
import type { BotStatus } from '../types'
import { useAuth } from '../context/AuthContext'

interface LayoutProps {
  children: React.ReactNode
  status: BotStatus | null
}

const SidebarItem = ({ to, icon: Icon, label }: { to: string; icon: typeof LayoutDashboard; label: string }) => {
  const location = useLocation()
  const isActive = location.pathname === to

  return (
    <Link
      to={to}
      className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium transition-all duration-200 rounded-xl ${
        isActive
          ? 'bg-primary/20 text-primary border border-primary/30 shadow-[0_0_15px_rgba(139,92,246,0.3)]'
          : 'text-slate-300 hover:bg-white/5 hover:text-white hover:translate-x-1'
      }`}
    >
      <Icon className={`h-5 w-5 ${isActive ? 'text-primary' : ''}`} />
      {label}
    </Link>
  )
}

export function Layout({ children, status: _status }: LayoutProps) {
  const { user, logout } = useAuth()

  return (
    <div className="min-h-screen flex">
      {/* Sidebar with glass effect */}
      <aside className="w-64 glass-nav flex flex-col sticky top-20 h-[calc(100vh-5rem)] z-40">
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 px-4 mt-2">Main</div>
          <SidebarItem to="/" icon={LayoutDashboard} label="Dashboard" />

          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 px-4 mt-6">Video</div>
          <SidebarItem to="/iptv" icon={Tv} label="IPTV" />
          <SidebarItem to="/bookmarks" icon={Bookmark} label="Bookmarks" />
          <SidebarItem to="/jellyfin" icon={PlayCircle} label="Jellyfin" />

          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 px-4 mt-6">Voice</div>
          <SidebarItem to="/soundboard" icon={Volume2} label="Soundboard" />
          <SidebarItem to="/music" icon={Music} label="Music" />

          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 px-4 mt-6">System</div>
          <SidebarItem to="/users" icon={Users} label="Users" />
          <SidebarItem to="/settings" icon={Settings} label="Settings" />
        </nav>

        {user && (
          <div className="p-4 border-t border-white/5">
            <div className="flex items-center gap-3 glass-light rounded-xl p-3">
              {/* Avatar */}
              <div className="h-10 w-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-semibold overflow-hidden shrink-0">
                {user.avatar ? (
                  <img src={user.avatar} alt={user.username} className="h-full w-full object-cover" />
                ) : (
                  <User className="h-5 w-5" />
                )}
              </div>
              {/* User Info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-200 truncate">{user.username}</p>
                <p className="text-xs text-slate-400 capitalize">{user.role}</p>
              </div>
              {/* Logout Button */}
              <button
                onClick={logout}
                className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors shrink-0"
                title="Logout"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </aside>

      {/* Main Content */}
      <main className="flex-1 mt-20 p-6 lg:p-8 overflow-auto">
        <div className="max-w-5xl mx-auto space-y-6 animate-fade-in">
          {children}
        </div>
      </main>
    </div>
  )
}
