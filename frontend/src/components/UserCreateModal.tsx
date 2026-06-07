import { useState, useEffect } from 'react'
import { Loader2, User } from 'lucide-react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Modal } from './ui/modal'
import { useApi } from '../hooks/useApi'

interface UserCreateModalProps {
  isOpen: boolean
  onClose: () => void
  onUserCreated: () => void
}

export function UserCreateModal({ isOpen, onClose, onUserCreated }: UserCreateModalProps) {
  const api = useApi()
  const [name, setName] = useState('')
  const [discordId, setDiscordId] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('user')
  const [loading, setLoading] = useState(false)
  const [validatingDiscord, setValidatingDiscord] = useState(false)
  const [discordUser, setDiscordUser] = useState<{ id: string; username: string; avatar_url: string | null } | null>(null)
  const [discordValid, setDiscordValid] = useState(false)

  // Validate Discord ID when it changes
  useEffect(() => {
    const trimmedId = discordId.trim()
    if (!trimmedId || !/^\d{17,20}$/.test(trimmedId)) {
      setDiscordUser(null)
      setDiscordValid(false)
      return
    }

    const timer = setTimeout(async () => {
      setValidatingDiscord(true)
      try {
        const result = await api.fetchDiscordUser(trimmedId)
        if (result && result.found) {
          setDiscordUser({
            id: trimmedId,
            username: result.username || 'Unknown',
            avatar_url: result.avatar_url || null,
          })
          setDiscordValid(true)
        } else {
          setDiscordUser(null)
          setDiscordValid(false)
        }
      } catch (error) {
        setDiscordUser(null)
        setDiscordValid(false)
      }
      setValidatingDiscord(false)
    }, 500)

    return () => clearTimeout(timer)
  }, [discordId, api.fetchDiscordUser])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!name.trim()) {
      api.showMessage('Name is required')
      return
    }
    
    if (!discordValid) {
      api.showMessage('Valid Discord ID is required')
      return
    }
    
    if (!password.trim()) {
      api.showMessage('Password is required')
      return
    }

    setLoading(true)
    try {
      const response = await api.post('/users/', {
        username: name.trim(),
        discord_id: discordUser?.id,
        password: password,
        role: role,
        avatar: discordUser?.avatar_url
      })

      if (response) {
        api.showMessage('User created successfully')
        onUserCreated()
        handleClose()
      }
    } catch (error) {
      console.error('Failed to create user:', error)
    }
    setLoading(false)
  }

  const handleClose = () => {
    setName('')
    setDiscordId('')
    setPassword('')
    setRole('user')
    setDiscordUser(null)
    setDiscordValid(false)
    onClose()
  }

  const canSubmit = name.trim() && discordValid && password.trim() && !loading

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Add New User">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Name Field */}
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Name
          </label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter user name"
            className="glass-input text-slate-200 placeholder:text-slate-500"
            required
          />
        </div>

        {/* Discord ID Field */}
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Discord ID
          </label>
          <div className="relative">
            <Input
              value={discordId}
              onChange={(e) => setDiscordId(e.target.value)}
              placeholder="Enter Discord User ID (17-20 digits)"
              className={`glass-input text-slate-200 placeholder:text-slate-500 pr-10 ${
                discordId && !discordValid ? 'border-red-400/50' : ''
              }`}
              required
            />
            {validatingDiscord && (
              <Loader2 className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 animate-spin text-slate-400" />
            )}
          </div>
          
          {/* Discord User Preview */}
          {discordUser && (
            <div className="mt-3 p-3 glass-light rounded-lg border border-primary/30">
              <div className="flex items-center gap-3">
                {discordUser.avatar_url ? (
                  <img src={discordUser.avatar_url} alt={discordUser.username} className="w-8 h-8 rounded-full" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                    <User className="h-4 w-4 text-slate-400" />
                  </div>
                )}
                <div>
                  <p className="font-medium text-slate-200">{discordUser.username}</p>
                  <p className="text-sm text-slate-400">ID: {discordUser.id}</p>
                </div>
              </div>
            </div>
          )}
          
          {/* Validation Error */}
          {discordId && !discordValid && !validatingDiscord && (
            <p className="mt-2 text-sm text-red-400">
              Invalid Discord User ID or user not found
            </p>
          )}
        </div>

        {/* Password Field */}
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Password
          </label>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter password"
            className="glass-input text-slate-200 placeholder:text-slate-500"
            required
          />
        </div>

        {/* Role Field */}
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Role
          </label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="w-full glass-input appearance-none bg-slate-800/30 backdrop-blur-sm border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 pr-8 focus:outline-none focus:ring-2 focus:ring-primary/50 hover:bg-white/10 transition-all duration-200"
          >
            <option value="user" className="bg-slate-900/95">User</option>
            <option value="admin" className="bg-slate-900/95">Admin</option>
          </select>
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-4">
          <Button
            type="button"
            variant="ghost"
            onClick={handleClose}
            className="flex-1"
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={!canSubmit}
            className="flex-1 gap-2 bg-primary/20 text-primary border border-primary/30 hover:bg-primary/30"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <User className="h-4 w-4" />}
            Create User
          </Button>
        </div>
      </form>
    </Modal>
  )
}
