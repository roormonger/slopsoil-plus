import { useState, useEffect } from 'react'
import { Loader2, UserPlus, Trash2 } from 'lucide-react'
import { Button } from '../components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table'
import { UserCreateModal } from '../components/UserCreateModal'
import { useApi } from '../hooks/useApi'
import type { User } from '../types'

export function Users() {
  const api = useApi()
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load users on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        console.log('Loading users...')
        const data = await api.get('/users')
        console.log('Users data:', data)
        if (data) {
          setUsers(data)
          setError(null)
        } else {
          setError('Failed to load users data')
        }
      } catch (error) {
        console.error('Failed to load users:', error)
        setError('Error loading users')
      }
      setLoading(false)
    }
    loadData()
  }, [])

  const handleRemoveUser = async (userId: string) => {
    const success = await api.delete(`/users/${userId}`)
    if (success) {
      setUsers(users.filter(user => user.user_id !== userId))
    }
  }

  const handleUserCreated = () => {
    // Reload users list
    const loadData = async () => {
      try {
        const data = await api.get('/users')
        if (data) setUsers(data)
      } catch (error) {
        console.error('Failed to reload users:', error)
      }
    }
    loadData()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-red-400">Error: {error}</div>
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
        <h2 className="text-3xl font-bold gradient-text mb-2">Users</h2>
        <p className="text-slate-400">Manage users allowed to interact with the bot</p>
      </div>

      <div className="glass-card rounded-2xl p-6 space-y-6">
          {/* Header with Add User button on the right */}
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-slate-200">User Management</h3>
              <p className="text-sm text-slate-400">Add and manage system users</p>
            </div>
            <Button
              onClick={() => setShowCreateModal(true)}
              className="gap-2 bg-primary/20 text-primary border border-primary/30 hover:bg-primary/30"
            >
              <UserPlus className="h-4 w-4" />
              Add User
            </Button>
          </div>

          {/* Users Table */}
          <div className="glass-light rounded-xl overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-white/5 border-b border-white/5">
                  <TableHead className="w-16 text-slate-400 font-medium">Avatar</TableHead>
                  <TableHead className="text-slate-400 font-medium">Username</TableHead>
                  <TableHead className="text-slate-400 font-medium">Role</TableHead>
                  <TableHead className="w-20 text-slate-400 font-medium">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.length === 0 ? (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={4} className="text-center text-slate-400 py-8">
                      No users added yet
                    </TableCell>
                  </TableRow>
                ) : (
                  users.map((user) => (
                    <TableRow key={user.user_id} className="hover:bg-white/5 border-b border-white/5">
                      <TableCell>
                        {user.avatar ? (
                          <img src={user.avatar} alt={user.username || ''} className="w-8 h-8 rounded-full" />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                            <span className="text-sm font-medium">{(user.username || '?').charAt(0).toUpperCase()}</span>
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium text-slate-200">{user.username || '-'}</p>
                          {user.discord_id && (
                            <p className="text-xs text-slate-400 font-mono">{user.discord_id}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          user.role === 'admin' 
                            ? 'bg-red-500/20 text-red-300 border border-red-500/30'
                            : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                        }`}>
                          {user.role || 'user'}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRemoveUser(user.user_id)}
                          className="h-8 w-8 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
      </div>

      {/* User Creation Modal */}
      <UserCreateModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onUserCreated={handleUserCreated}
      />
    </div>
  )
}
