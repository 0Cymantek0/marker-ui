import { XCircle, Loader2 } from 'lucide-react'
import { Progress } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { ConversionState } from '@/hooks/useConversion'

interface ConversionProgressProps {
  state: ConversionState
  onCancel: () => void
}

export function ConversionProgress({ state, onCancel }: ConversionProgressProps) {
  const { phase, progress, statusText, error } = state

  if (phase === 'idle') return null

  return (
    <div className="glass-card p-5 space-y-4 animate-fade-in">
      {/* Status header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {phase === 'uploading' || phase === 'processing' ? (
            <Loader2 className="w-4 h-4 text-primary animate-spin" />
          ) : phase === 'completed' ? (
            <div className="w-4 h-4 rounded-full bg-emerald-500" />
          ) : (
            <XCircle className="w-4 h-4 text-destructive" />
          )}
          <span className="text-sm font-medium">{statusText}</span>
        </div>

        {phase !== 'completed' && phase !== 'failed' && (
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>

      {/* Progress bar */}
      {(phase === 'uploading' || phase === 'processing') && (
        <div className="space-y-2">
          <Progress value={progress} />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{statusText}</span>
            <span>{Math.round(progress)}%</span>
          </div>
        </div>
      )}

      {/* Error */}
      {phase === 'failed' && error && (
        <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          {error}
        </div>
      )}

      {/* Completion badge */}
      {phase === 'completed' && (
        <Badge variant="success">Conversion complete — ready to download</Badge>
      )}
    </div>
  )
}
