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

  let indicatorColor = 'bg-slate-700'
  if (isCompleted) {
    indicatorColor = 'bg-gradient-to-r from-emerald-500 to-teal-500'
  } else if (isDownloading) {
    indicatorColor = 'bg-gradient-to-r from-violet-500 to-indigo-500'
  } else if (isLoading) {
    indicatorColor = 'bg-gradient-to-r from-amber-500 to-orange-500'
  } else if (isFailed) {
    indicatorColor = 'bg-gradient-to-r from-rose-500 to-red-500'
  }

  return (
    <div className="space-y-8 select-none">
      {/* Title Header */}
      <div className="space-y-3 pb-6 border-b border-slate-800/60">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-violet-500 to-indigo-600 rounded-xl shadow-lg shadow-violet-500/10">
            <Database className="h-5.5 w-5.5 text-white" />
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
            One-Time Setup
          </h1>
        </div>
        <p className="text-slate-400 text-xs md:text-sm leading-relaxed max-w-md">
          Marker requires localized AI models to execute document conversion and layout extraction.
          We are setting up your local environment.
        </p>
      </div>

      {/* Main Status & Large Meter */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-wider font-extrabold text-slate-500">
            Overall Setup Progress
          </span>
          <div>
            {isCompleted && (
              <Badge className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2.5 py-1 rounded-full flex items-center gap-1.5 font-bold text-xs">
                <CheckCircle2 className="h-3.5 w-3.5" /> Ready
              </Badge>
            )}
            {isDownloading && (
              <Badge className="bg-violet-500/10 text-violet-400 border border-violet-500/20 px-2.5 py-1 rounded-full flex items-center gap-1.5 font-bold text-xs animate-pulse">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Downloading
              </Badge>
            )}
            {isLoading && (
              <Badge className="bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2.5 py-1 rounded-full flex items-center gap-1.5 font-bold text-xs animate-pulse">
                <Cpu className="h-3.5 w-3.5 animate-spin" /> Initializing Engine
              </Badge>
            )}
            {isFailed && (
              <Badge className="bg-rose-500/10 text-rose-400 border border-rose-500/20 px-2.5 py-1 rounded-full flex items-center gap-1.5 font-bold text-xs">
                <XCircle className="h-3.5 w-3.5" /> Interrupted
              </Badge>
            )}
            {isPending && (
              <Badge className="bg-slate-900 text-slate-400 border border-slate-800 px-2.5 py-1 rounded-full flex items-center gap-1.5 font-bold text-xs">
                <Download className="h-3.5 w-3.5" /> Waiting
              </Badge>
            )}
          </div>
        </div>

        {/* Big visual number and speed/ETA statistics HUD */}
        <div className="flex items-baseline justify-between gap-4">
          <div className="flex items-baseline gap-2">
            <span className="text-6xl font-black tracking-tighter font-mono text-slate-200">
              {overall.progress}%
            </span>
            {isDownloading && (
              <span className="text-xs text-slate-500 font-mono">
                ({formatBytes(overall.downloaded_bytes)} of {formatBytes(overall.total_bytes)})
              </span>
            )}
          </div>

          {isDownloading && (
            <div className="flex items-center gap-4 bg-slate-950/40 border border-slate-900/60 rounded-lg px-3 py-1.5 font-mono text-[10px] leading-tight">
              <div>
                <span className="text-slate-500 block uppercase font-extrabold text-[8px]">Speed</span>
                <span className="text-violet-400 font-bold">{overall.speed.toFixed(1)} MB/s</span>
              </div>
              <div className="w-px h-5.5 bg-slate-800" />
              <div>
                <span className="text-slate-500 block uppercase font-extrabold text-[8px]">Time</span>
                <span className="text-violet-400 font-bold">{formatETA(overall.eta)}</span>
              </div>
            </div>
          )}
        </div>

        {/* Elegant thin progress bar with glowing blur shadow */}
        <div className="relative pt-1 select-none">
          <Progress
            value={overall.progress}
            className="h-1 bg-slate-800/60 rounded-full"
            indicatorClassName={indicatorColor}
          />
          {isDownloading && (
            <div className="absolute inset-0 bg-gradient-to-r from-violet-500 to-indigo-500/20 blur-sm rounded-full -z-10" />
          )}
        </div>
      </div>

      {/* Button Controls */}
      <div className="flex items-center gap-3">
        {isDownloading && (
          <Button
            variant="outline"
            onClick={handleCancel}
            disabled={isCancelling}
            className="w-full md:w-auto border-slate-800 hover:border-slate-700 bg-slate-900/40 hover:bg-slate-900 text-slate-400 hover:text-slate-200 px-5 py-2 h-10 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors"
          >
            {isCancelling ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> Cancelling
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
            className="w-full md:w-auto bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-bold rounded-xl px-5 py-2 h-10 shadow-lg shadow-violet-600/15 text-xs uppercase tracking-wider transition-all"
          >
            {isRetrying ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> Starting...
              </>
            ) : (
              <>
                <Play className="h-3.5 w-3.5 mr-1.5" /> Restart Setup
              </>
            )}
          </Button>
        )}

        {isCompleted && (
          <Button
            onClick={onComplete}
            className="w-full md:w-auto bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-bold rounded-xl px-5 py-2 h-10 shadow-lg shadow-emerald-500/10 text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all duration-300"
          >
            Continue to Workspace <ArrowRight className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  )
}
