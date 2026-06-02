import { Volume2 } from 'lucide-react'

export function Soundboard() {
  return (
    <div className="space-y-6">
      <div className="mb-8">
        <h2 className="text-3xl font-bold gradient-text mb-2">Soundboard</h2>
        <p className="text-slate-400">Play sound clips in voice channels</p>
      </div>

      <div className="glass-card rounded-2xl p-8 text-center">
        <div className="w-16 h-16 rounded-2xl glass-light flex items-center justify-center mx-auto mb-6">
          <Volume2 className="w-8 h-8 text-primary" />
        </div>
        <h3 className="text-2xl font-semibold text-slate-200 mb-3">Coming Soon</h3>
        <p className="text-slate-400 max-w-md mx-auto">
          Soundboard functionality will be added in a future update. You'll be able to upload and play audio clips directly in Discord voice channels.
        </p>
      </div>
    </div>
  )
}
