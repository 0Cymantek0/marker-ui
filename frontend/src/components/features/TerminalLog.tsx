import { useEffect, useRef, useState } from 'react'
import { Terminal, Copy, Check, Trash2, ArrowDownCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface TerminalLogProps {
  logs: string[]
  phase: string
  onClear?: () => void
}

export function TerminalLog({ logs, phase, onClear }: TerminalLogProps) {
  const [copied, setCopied] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Auto scroll to bottom
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [logs])

  const copyLogs = async () => {
    if (logs.length === 0) return
    const text = logs.join('\n')
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const getLogColorClass = (log: string) => {
    if (log.startsWith('[ERROR]')) return 'text-rose-600 dark:text-rose-400 font-semibold'
    if (log.startsWith('[WARN]') || log.startsWith('[WARNING]')) return 'text-amber-600 dark:text-amber-400'
    if (log.startsWith('[SUCCESS]')) return 'text-emerald-600 dark:text-emerald-400 font-semibold'
    if (log.startsWith('[SYSTEM]')) return 'text-cyan-600 dark:text-cyan-400 font-medium'
    return 'text-foreground/80'
  }

  const getStatusText = () => {
    switch (phase) {
      case 'idle': return 'READY'
      case 'uploading': return 'UPLOADING'
      case 'processing': return 'CONVERTING'
      case 'completed': return 'FINISHED'
      case 'failed': return 'ERROR'
      default: return 'STANDBY'
    }
  }

  const isRunning = phase === 'uploading' || phase === 'processing'

  return (
    <div className="glass-card flex flex-col h-[280px] bg-secondary/40 dark:bg-card border-border/80 rounded-xl overflow-hidden shadow-lg select-text">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-muted/80 dark:bg-secondary/60 border-b border-border/60">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-primary animate-pulse" />
          <span className="text-xs font-mono font-bold tracking-wider text-muted-foreground">CONSOLE LOGS</span>
          <span className={cn(
            'ml-2 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold tracking-widest',
            phase === 'idle' && 'bg-muted dark:bg-secondary text-muted-foreground',
            phase === 'uploading' && 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 animate-pulse',
            phase === 'processing' && 'bg-primary/20 text-primary animate-pulse',
            phase === 'completed' && 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
            phase === 'failed' && 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
          )}>
            {getStatusText()}
          </span>
        </div>

        <div className="flex items-center gap-1">
          {logs.length > 0 && (
            <>
              <Button
                variant="ghost"
                size="icon"
                onClick={copyLogs}
                className="w-7 h-7 hover:bg-muted dark:hover:bg-secondary text-muted-foreground hover:text-foreground"
                title="Copy logs"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
              </Button>
              {onClear && !isRunning && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onClear}
                  className="w-7 h-7 hover:bg-muted dark:hover:bg-secondary text-muted-foreground hover:text-rose-500"
                  title="Clear console"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Terminal lines */}
      <div
        ref={containerRef}
        className="flex-1 p-4 overflow-y-auto font-mono text-xs space-y-1.5 scrollbar-thin scrollbar-thumb-muted-foreground/30 scrollbar-track-transparent"
      >
        {logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground/80 italic select-none">
            <ArrowDownCircle className="w-6 h-6 mb-2 stroke-[1.5]" />
            <span>Console standby. Submit a file to begin extraction...</span>
          </div>
        ) : (
          <>
            {logs.map((log, index) => (
              <div key={index} className={cn('leading-relaxed break-all', getLogColorClass(log))}>
                <span className="text-muted-foreground/60 mr-2 select-none">&gt;</span>
                {log}
              </div>
            ))}
            {isRunning && (
              <div className="flex items-center text-primary font-bold">
                <span className="text-muted-foreground/60 mr-2 select-none">&gt;</span>
                <span className="animate-pulse">_</span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
