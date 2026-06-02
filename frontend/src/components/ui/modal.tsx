import { ReactNode } from 'react'
import { X } from 'lucide-react'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  children: ReactNode
}

export function Modal({ isOpen, onClose, title, children }: ModalProps) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative glass-card rounded-2xl p-6 w-full max-w-md mx-4 border border-white/10">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-slate-200">{title}</h2>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-white/10 transition-colors"
          >
            <X className="h-5 w-5 text-slate-400" />
          </button>
        </div>
        
        {/* Content */}
        <div className="space-y-4">
          {children}
        </div>
      </div>
    </div>
  )
}
