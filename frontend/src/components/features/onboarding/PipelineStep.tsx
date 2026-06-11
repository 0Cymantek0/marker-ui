import { CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react'
import { Progress } from '@/components/ui/progress'

export type StepStatus = 'pending' | 'downloading' | 'completed' | 'failed'

interface PipelineStepProps {
  stepNumber: string
  title: string
  description: string
  status: StepStatus
  progress: number
  downloadedBytes: number
  totalBytes: number
  isLast?: boolean
  nextStatus?: StepStatus
}

function formatBytes(bytes: number, decimals = 1): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i]
}

export function PipelineStep({
  stepNumber,
  title,
  description,
  status,
  progress,
  downloadedBytes,
  totalBytes,
  isLast = false,
  nextStatus,
}: PipelineStepProps) {
  const isDownloading = status === 'downloading'
  const isCompleted = status === 'completed'
  const isFailed = status === 'failed'

  // Determine line segment color based on status and nextStatus
  let lineStyles = 'bg-slate-800'
  let isLineAnimated = false

  if (isCompleted) {
    if (nextStatus === 'completed') {
      lineStyles = 'bg-emerald-500/80'
    } else if (nextStatus === 'downloading') {
      lineStyles = 'bg-gradient-to-b from-emerald-500/80 to-violet-500/80'
    } else {
      lineStyles = 'bg-gradient-to-b from-emerald-500/80 to-slate-800'
    }
  } else if (isDownloading) {
    lineStyles = 'bg-gradient-to-b from-violet-500/80 to-slate-800'
    isLineAnimated = true
  } else if (isFailed) {
    lineStyles = 'bg-gradient-to-b from-rose-500/80 to-slate-850'
  }

  return (
    <div className="flex gap-4 relative group">
      {/* Node indicator */}
      <div className="flex flex-col items-center shrink-0 relative w-9">
        {/* Step-specific vertical line segment */}
        {!isLast && (
          <div
            className={`absolute top-9 bottom-0 w-[2px] left-1/2 -translate-x-1/2 rounded-full transition-all duration-500 ${lineStyles} ${
              isLineAnimated ? 'animate-pulse duration-[1500ms]' : ''
            }`}
          />
        )}

        <div
          className={`w-9 h-9 rounded-full border flex items-center justify-center transition-all duration-500 relative z-10 ${
            isCompleted
              ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.15)]'
              : isDownloading
              ? 'bg-violet-500/10 border-violet-500/50 text-violet-400 shadow-[0_0_20px_rgba(139,92,246,0.3)]'
              : isFailed
              ? 'bg-rose-500/10 border-rose-500/40 text-rose-400 shadow-[0_0_15px_rgba(244,63,94,0.15)]'
              : 'bg-slate-900/50 border-slate-800 text-slate-500'
          }`}
        >
          {/* Subtle spinning glow backdrop for downloading state */}
          {isDownloading && (
            <div className="absolute inset-[-2px] rounded-full border border-t-violet-400 border-r-transparent border-b-transparent border-l-transparent animate-spin duration-1000" />
          )}

          {isCompleted ? (
            <CheckCircle2 className="w-4.5 h-4.5" />
          ) : isDownloading ? (
            <Loader2 className="w-4.5 h-4.5 animate-spin" />
          ) : isFailed ? (
            <AlertTriangle className="w-4.5 h-4.5" />
          ) : (
            <span className="text-xs font-bold font-mono">{stepNumber}</span>
          )}
        </div>
      </div>

      {/* Details Area */}
      <div className="flex-1 pb-8 space-y-2">
        <div className="flex flex-wrap items-baseline gap-2">
          <h4
            className={`text-sm font-bold tracking-wide transition-colors duration-300 ${
              isCompleted
                ? 'text-emerald-400'
                : isDownloading
                ? 'text-violet-300'
                : isFailed
                ? 'text-rose-400'
                : 'text-slate-400'
            }`}
          >
            {title}
          </h4>
          <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">
            {status}
          </span>
        </div>

        <p className="text-xs text-slate-400 leading-relaxed max-w-xl">
          {description}
        </p>

        {/* Dynamic Download metrics & progress bar */}
        {(isDownloading || (progress > 0 && !isCompleted)) && (
          <div className="space-y-1.5 pt-1.5 animate-fade-in max-w-md">
            <div className="flex items-center justify-between text-[10px] font-mono text-slate-500">
              <span className="font-bold text-violet-400">{progress}%</span>
              {totalBytes > 0 && (
                <span>
                  {formatBytes(downloadedBytes)} / {formatBytes(totalBytes)}
                </span>
              )}
            </div>
            <div className="relative">
              <Progress
                value={progress}
                className="h-1 bg-slate-800/60 rounded-full"
                indicatorClassName="bg-gradient-to-r from-violet-500 to-indigo-500"
              />
              {isDownloading && (
                <div className="absolute inset-0 bg-violet-500/10 blur-sm rounded-full -z-10" />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
