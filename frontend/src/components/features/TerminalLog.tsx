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
    return 'text-slate-700 dark:text-slate-300'
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
    <div className="glass-card flex flex-col h-[280px] bg-slate-100/50 dark:bg-slate-950 border-slate-200 dark:border-slate-900 rounded-xl overflow-hidden shadow-lg select-text">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-slate-200/80 dark:bg-slate-900 border-b border-slate-300/60 dark:border-slate-800/80">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-primary animate-pulse" />
          <span className="text-xs font-mono font-bold tracking-wider text-slate-600 dark:text-slate-400">CONSOLE LOGS</span>
          <span className={cn(
            'ml-2 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold tracking-widest',
            phase === 'idle' && 'bg-slate-300/50 dark:bg-slate-800 text-slate-600 dark:text-slate-400',
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
                className="w-7 h-7 hover:bg-slate-300/50 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
                title="Copy logs"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
              </Button>
              {onClear && !isRunning && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onClear}
                  className="w-7 h-7 hover:bg-slate-300/50 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400"
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
        className="flex-1 p-4 overflow-y-auto font-mono text-xs space-y-1.5 scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-800 scrollbar-track-transparent"
      >
        {logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-400 dark:text-slate-500 italic select-none">
            <ArrowDownCircle className="w-6 h-6 mb-2 stroke-[1.5]" />
            <span>Console standby. Submit a file to begin extraction...</span>
          </div>
        ) : (
          <>
            {logs.map((log, index) => (
              <div key={index} className={cn('leading-relaxed break-all', getLogColorClass(log))}>
                <span className="text-slate-400 dark:text-slate-600 mr-2 select-none">&gt;</span>
                {log}
              </div>
            ))}
            {isRunning && (
              <div className="flex items-center text-primary font-bold">
                <span className="text-slate-400 dark:text-slate-600 mr-2 select-none">&gt;</span>
                <span className="animate-pulse">_</span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
