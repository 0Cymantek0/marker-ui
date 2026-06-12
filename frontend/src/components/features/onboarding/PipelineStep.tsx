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
  let lineStyles = 'bg-border/20'
  let isLineAnimated = false

  if (isCompleted) {
    if (nextStatus === 'completed') {
      lineStyles = 'bg-primary'
    } else if (nextStatus === 'downloading') {
      lineStyles = 'bg-gradient-to-b from-primary to-primary/40'
    } else {
      lineStyles = 'bg-gradient-to-b from-primary to-border/20'
    }
  } else if (isDownloading) {
    lineStyles = 'bg-gradient-to-b from-primary/40 to-border/10'
    isLineAnimated = true
  } else if (isFailed) {
    lineStyles = 'bg-gradient-to-b from-destructive/60 to-border/10'
  }

  return (
    <div className="flex gap-5 relative group">
      {/* Node indicator */}
      <div className="flex flex-col items-center shrink-0 relative w-11">
        {/* Step-specific vertical line segment */}
        {!isLast && (
          <div
            className={`absolute top-11 bottom-0 w-[1.5px] left-1/2 -translate-x-1/2 rounded-full transition-all duration-500 ${lineStyles} ${
              isLineAnimated ? 'animate-pulse duration-[1500ms]' : ''
            }`}
          />
        )}

        <div
          className={`w-10 h-10 rounded-full border flex items-center justify-center transition-all duration-500 relative z-10 ${
            isCompleted
              ? 'bg-primary border-primary text-primary-foreground'
              : isDownloading
              ? 'bg-secondary border-primary/40 text-foreground'
              : isFailed
              ? 'bg-destructive/10 border-destructive/40 text-destructive'
              : 'bg-secondary/40 border-border/40 text-muted-foreground/40'
          }`}
        >
          {isCompleted ? (
            <CheckCircle2 className="w-5 h-5" />
          ) : isDownloading ? (
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
          ) : isFailed ? (
            <AlertTriangle className="w-5 h-5" />
          ) : (
            <span className="text-xs font-bold font-mono">{stepNumber}</span>
          )}
        </div>
      </div>

      {/* Details Area */}
      <div className="flex-1 pb-10 space-y-2">
        <div className="flex flex-wrap items-baseline gap-2.5">
          <h4
            className={`text-sm md:text-base font-bold tracking-tight transition-colors duration-300 ${
              isCompleted
                ? 'text-foreground'
                : isDownloading
                ? 'text-foreground/80'
                : isFailed
                ? 'text-destructive'
                : 'text-muted-foreground/40'
            }`}
          >
            {title}
          </h4>
          <span className="text-[10px] font-mono text-muted-foreground/40 uppercase tracking-widest font-bold">
            {status}
          </span>
        </div>

        <p className="text-xs md:text-sm text-muted-foreground/65 leading-relaxed max-w-xl font-medium">
          {description}
        </p>

        {/* Dynamic Download metrics & progress bar */}
        {(isDownloading || (progress > 0 && !isCompleted)) && (
          <div className="space-y-1.5 pt-1 animate-fade-in max-w-sm">
            <div className="flex items-center justify-between text-xs font-mono text-muted-foreground/60">
              <span className="font-bold text-foreground/80">{progress}%</span>
              {totalBytes > 0 && (
                <span>
                  {formatBytes(downloadedBytes)} / {formatBytes(totalBytes)}
                </span>
              )}
            </div>
            <div className="relative">
              <Progress
                value={progress}
                className="h-1 bg-secondary rounded-full"
                indicatorClassName="bg-primary"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
