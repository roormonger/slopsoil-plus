import { Link, useLocation } from 'react-router-dom'
import { LayoutDashboard, Users, Settings, Tv, Bookmark, Volume2, Music, PlayCircle } from 'lucide-react'
import type { BotStatus } from '../types'

interface LayoutProps {
  children: React.ReactNode
  status: BotStatus | null
}

const getStatusColor = (status: string) => {
  switch (status) {
    case 'running':
      return 'text-emerald-400 status-pulse'
    case 'stopped':
      return 'text-red-400'
    case 'pending_reload':
      return 'text-amber-400'
    default:
      return 'text-slate-400'
  }
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

export function Layout({ children, status }: LayoutProps) {
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

        <div className="p-4 border-t border-white/5">
          <div className="flex items-center gap-3 glass-light rounded-xl p-3">
            <div className={`w-2.5 h-2.5 rounded-full ${getStatusColor(status?.status || '')}`} />
            <div className="flex-1">
              <p className="text-xs text-slate-400">Bot Status</p>
              <p className="text-sm font-medium capitalize text-slate-200">
                {(status?.status || 'Unknown').replace('_', ' ')}
              </p>
            </div>
          </div>
        </div>
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
