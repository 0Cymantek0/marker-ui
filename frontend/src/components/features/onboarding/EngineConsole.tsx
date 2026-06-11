import {
  Download,
  CheckCircle2,
  Loader2,
  Play,
  XCircle,
  Cpu,
  Database,
  ArrowRight,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import type { ModelTrackerStatus } from '@/lib/api'

interface EngineConsoleProps {
  status: ModelTrackerStatus
  isCancelling: boolean
  isRetrying: boolean
  handleCancel: () => Promise<void>
  handleRetry: () => Promise<void>
  onComplete: () => void
}

function formatBytes(bytes: number, decimals = 1): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i]
}

function formatETA(seconds: number): string {
  if (seconds <= 0 || isNaN(seconds) || !isFinite(seconds)) return 'Calculating...'
  if (seconds < 60) return `${seconds}s`
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}m ${secs}s`
}

export function EngineConsole({
  status,
  isCancelling,
  isRetrying,
  handleCancel,
  handleRetry,
  onComplete,
}: EngineConsoleProps) {
  const overall = status.overall
  const isPending = overall.status === 'pending'
  const isDownloading = overall.status === 'downloading'
  const isLoading = overall.status === 'loading'
  const isCompleted = overall.status === 'completed' || status.initialized
  const isFailed = overall.status === 'failed'

  let indicatorColor = 'bg-muted'
  if (isCompleted) {
    indicatorColor = 'bg-primary'
  } else if (isDownloading) {
    indicatorColor = 'bg-primary/60'
  } else if (isLoading) {
    indicatorColor = 'bg-primary/40'
  } else if (isFailed) {
    indicatorColor = 'bg-destructive'
  }

  return (
    <div className="space-y-8 select-none">
      {/* Title Header */}
      <div className="space-y-3 pb-6 border-b border-border/40">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-secondary rounded-xl">
            <Database className="h-5 w-5 text-foreground/80" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">
            One-Time Setup
          </h1>
        </div>
        <p className="text-muted-foreground text-xs md:text-sm leading-relaxed max-w-sm">
          Marker requires localized AI models to execute document conversion and layout extraction.
          We are setting up your local environment.
        </p>
      </div>

      {/* Main Status & Large Meter */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-wider font-extrabold text-muted-foreground/60">
            Overall Setup Progress
          </span>
          <div className="flex items-center gap-2">
            {isCompleted && (
              <div className="flex items-center gap-1.5 text-foreground/80 font-bold text-xs">
                <CheckCircle2 className="h-3.5 w-3.5 text-primary" /> Ready
              </div>
            )}
            {isDownloading && (
              <div className="flex items-center gap-1.5 text-foreground/60 font-bold text-xs">
                <span className="animate-shimmer text-foreground inline-block">Downloading Assets</span>
              </div>
            )}
            {isLoading && (
              <div className="flex items-center gap-1.5 text-foreground/60 font-bold text-xs">
                <span className="animate-shimmer text-foreground inline-block">Initializing Engine</span>
              </div>
            )}
            {isFailed && (
              <div className="flex items-center gap-1.5 text-destructive font-bold text-xs uppercase tracking-tight">
                <XCircle className="h-3.5 w-3.5" /> Interrupted
              </div>
            )}
            {isPending && (
              <div className="flex items-center gap-1.5 text-muted-foreground font-bold text-xs uppercase tracking-tight">
                <Download className="h-3.5 w-3.5" /> Waiting
              </div>
            )}
          </div>
        </div>

        {/* Big visual number and speed/ETA statistics HUD */}
        <div className="flex items-baseline justify-between gap-4">
          <div className="flex items-baseline gap-2">
            <span className="text-6xl font-black tracking-tighter font-mono text-foreground">
              {overall.progress}%
            </span>
            {isDownloading && (
              <span className="text-[10px] text-muted-foreground/60 font-mono">
                {formatBytes(overall.downloaded_bytes)} / {formatBytes(overall.total_bytes)}
              </span>
            )}
          </div>

          {isDownloading && (
            <div className="flex items-center gap-3 bg-secondary/50 border border-border/40 rounded-lg px-2.5 py-1.5 font-mono text-[10px] leading-tight">
              <div>
                <span className="text-muted-foreground/40 block uppercase font-extrabold text-[8px]">Speed</span>
                <span className="text-foreground/80 font-bold">{overall.speed.toFixed(1)} MB/s</span>
              </div>
              <div className="w-px h-4 bg-border/40" />
              <div>
                <span className="text-muted-foreground/40 block uppercase font-extrabold text-[8px]">Time</span>
                <span className="text-foreground/80 font-bold">{formatETA(overall.eta)}</span>
              </div>
            </div>
          )}
        </div>

        {/* Elegant thin progress bar */}
        <div className="relative pt-1 select-none">
          <Progress
            value={overall.progress}
            className="h-1 bg-secondary rounded-full"
            indicatorClassName={indicatorColor}
          />
        </div>
      </div>

      {/* Button Controls */}
      <div className="flex items-center gap-3">
        {isDownloading && (
          <Button
            variant="outline"
            onClick={handleCancel}
            disabled={isCancelling}
            className="w-full md:w-auto border-border/60 hover:border-border bg-transparent text-muted-foreground hover:text-foreground px-5 py-2 h-9 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors"
          >
            {isCancelling ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin mr-1.5" /> Cancelling
              </>
            ) : (
              'Cancel Setup'
            )}
          </Button>
        )}

        {isFailed && (
          <Button
            onClick={handleRetry}
            disabled={isRetrying}
            className="w-full md:w-auto bg-primary text-primary-foreground font-bold rounded-lg px-5 py-2 h-9 text-[10px] uppercase tracking-wider transition-all"
          >
            {isRetrying ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin mr-1.5" /> Starting...
              </>
            ) : (
              <>
                <Play className="h-3 w-3 mr-1.5 fill-current" /> Restart Setup
              </>
            )}
          </Button>
        )}

        {isCompleted && (
          <Button
            onClick={onComplete}
            className="w-full md:w-auto bg-foreground text-background hover:bg-foreground/90 font-bold rounded-lg px-5 py-2 h-9 text-[10px] uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all"
          >
            Continue to Workspace <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  )
}
