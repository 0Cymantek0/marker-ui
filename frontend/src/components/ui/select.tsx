import * as React from 'react'
import { ChevronDown, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface SelectOption {
  value: string
  label: string
}

interface SelectProps {
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  className?: string
}

export function Select({ value, onChange, options, className }: SelectProps) {
  const [isOpen, setIsOpen] = React.useState(false)
  const containerRef = React.useRef<HTMLDivElement>(null)

  const selectedOption = options.find((opt) => opt.value === value) || options[0]

  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div ref={containerRef} className={cn('relative w-full md:w-44', className)}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'flex items-center justify-between w-full px-3 py-2 bg-background/40 hover:bg-muted/30 border border-border/50 rounded-lg text-xs font-semibold text-foreground transition-all duration-200 focus:outline-none focus:ring-1 focus:ring-primary text-left',
          isOpen && 'ring-1 ring-primary border-primary/40 bg-muted/20'
        )}
      >
        <span className="truncate">{selectedOption?.label}</span>
        <ChevronDown 
          className={cn(
            'w-3.5 h-3.5 text-muted-foreground transition-transform duration-200 shrink-0 ml-2', 
            isOpen && 'transform rotate-180 text-foreground'
          )} 
        />
      </button>

      {isOpen && (
        <div className="absolute z-50 w-full mt-1.5 origin-top-right rounded-lg border border-border/50 bg-background/95 backdrop-blur-md shadow-lg py-1 max-h-60 overflow-y-auto focus:outline-none animate-in fade-in slide-in-from-top-1 duration-100">
          {options.map((option) => {
            const isSelected = option.value === value
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  onChange(option.value)
                  setIsOpen(false)
                }}
                className={cn(
                  'flex items-center justify-between w-full px-3 py-1.5 text-xs text-left transition-colors duration-150',
                  isSelected 
                    ? 'bg-primary/10 text-primary font-bold' 
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
                )}
              >
                <span className="truncate">{option.label}</span>
                {isSelected && <Check className="w-3.5 h-3.5 text-primary shrink-0 ml-2" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
