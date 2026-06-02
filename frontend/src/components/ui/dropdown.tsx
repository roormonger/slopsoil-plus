import { useState, useRef, useEffect } from 'react'
import { ChevronDown } from 'lucide-react'

interface DropdownOption {
  value: string
  label: string
}

interface DropdownProps {
  options: DropdownOption[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  className?: string
}

export function Dropdown({ 
  options, 
  value, 
  onChange, 
  placeholder = "Select an option", 
  disabled = false,
  className = "" 
}: DropdownProps) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const selectedOption = options.find(option => option.value === value)
  const displayValue = selectedOption ? selectedOption.label : placeholder

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSelect = (optionValue: string) => {
    onChange(optionValue)
    setIsOpen(false)
  }

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={`
          glass-input appearance-none bg-slate-800/30 backdrop-blur-sm border border-white/10 
          rounded-lg px-3 py-1.5 text-sm text-slate-200 pr-8 w-full text-left
          focus:outline-none focus:ring-2 focus:ring-primary/50 hover:bg-white/10 
          transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed
          ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}
        `}
      >
        <span className={value ? 'text-slate-200' : 'text-slate-400'}>
          {displayValue}
        </span>
        <ChevronDown 
          className={`absolute right-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none transition-transform duration-200 ${
            isOpen ? 'rotate-180' : ''
          }`} 
        />
      </button>

      {isOpen && !disabled && (
        <div className="absolute z-50 w-full mt-1 glass-card rounded-lg border border-white/10 shadow-lg max-h-60 overflow-auto">
          <div className="py-1">
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => handleSelect(option.value)}
                className={`
                  w-full px-3 py-2 text-sm text-left transition-colors duration-150
                  ${option.value === value 
                    ? 'bg-primary/20 text-primary border-l-2 border-primary' 
                    : 'text-slate-200 hover:bg-white/10 hover:text-slate-100'
                  }
                `}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
