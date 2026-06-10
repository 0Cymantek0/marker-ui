import { useEffect, useState } from 'react'
import {
  getModelsStatus,
  cancelModelsDownload,
  retryModelsDownload,
  ModelTrackerStatus,
} from '@/lib/api'
import { CanvasConfetti } from '@/components/ui/CanvasConfetti'
import { Progress } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Download,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Play,
  XCircle,
  Cpu,
  Database,
  ArrowRight,
} from 'lucide-react'
import { toast } from 'sonner'

interface OnboardingPageProps {
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

export function OnboardingPage({ onComplete }: OnboardingPageProps) {
  const [status, setStatus] = useState<ModelTrackerStatus | null>(null)
  const [isCancelling, setIsCancelling] = useState(false)
  const [isRetrying, setIsRetrying] = useState(false)
  const [showConfetti, setShowConfetti] = useState(false)
  const [firstLoadCheck, setFirstLoadCheck] = useState(true)

  // State to track if it was already downloaded at startup (for auto-bypass)
  const [startedWithCompleted, setStartedWithCompleted] = useState<boolean | null>(null)

  useEffect(() => {
    let timer: NodeJS.Timeout

    const pollStatus = async () => {
      try {
        const data = await getModelsStatus()
        setStatus(data)

        if (firstLoadCheck) {
          setFirstLoadCheck(false)
          // If already initialized, trigger parent callback immediately
          if (data.initialized) {
            onComplete()
            return
          }
          // If everything is already completed on disk (overall completed) but loading,
          // we track that it started already completed so we can bypass the button.
          if (data.overall.status === 'completed') {
            setStartedWithCompleted(true)
            onComplete()
            return
          } else {
            setStartedWithCompleted(false)
          }
        } else {
          // If initialization completes during polling
          if (data.initialized) {
            setShowConfetti(true)
            // Auto-redirect to workspace after a 3-second delay to show the confetti celebration
            const redirectTimer = setTimeout(() => {
              onComplete()
            }, 3000)
            return () => clearTimeout(redirectTimer)
          }
        }
      } catch (err) {
        console.error('Failed to fetch model status:', err)
      }
      timer = setTimeout(pollStatus, 1500)
    }

    pollStatus()

    return () => clearTimeout(timer)
  }, [onComplete, firstLoadCheck, startedWithCompleted])

  const handleCancel = async () => {
    setIsCancelling(true)
    try {
      await cancelModelsDownload()
      toast.success('Cancellation request sent')
    } catch (err: any) {
      toast.error(err.message || 'Failed to cancel')
    } finally {
      setIsCancelling(false)
    }
  }

  const handleRetry = async () => {
    setIsRetrying(true)
    try {
      await retryModelsDownload()
      toast.success('Download restarted successfully')
    } catch (err: any) {
      toast.error(err.message || 'Failed to restart')
    } finally {
      setIsRetrying(false)
    }
  }

  if (!status) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950 text-slate-100 p-6">
        <Loader2 className="h-10 w-10 text-indigo-500 animate-spin mb-4" />
        <p className="text-slate-400 font-medium">Connecting to Marker engine...</p>
      </div>
    )
  }

  const overall = status.overall
  const isPending = overall.status === 'pending'
  const isDownloading = overall.status === 'downloading'
  const isLoading = overall.status === 'loading'
  const isCompleted = overall.status === 'completed' || status.initialized
  const isFailed = overall.status === 'failed'

  // Descriptions for Surya models
  const modelDescriptions: Record<string, string> = {
    layout: 'Analyzes document layouts to separate columns, text, headers, and images.',
    text_recognition: 'High-accuracy neural OCR for converting image text into unicode string.',
    text_detection: 'Detects the bounding boxes of words and sentences across document pages.',
    table_recognition: 'Identifies grid cells, column alignments, and nested structures in tables.',
    ocr_error_detection: 'Fixes common optical character recognition errors and spelling slips.',
  }

  return (
    <div className="relative min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950/20 text-slate-100 flex items-center justify-center p-4 md:p-8 overflow-hidden select-none">
      {showConfetti && <CanvasConfetti />}

      {/* Background ambient glowing orbs */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl -z-10 animate-pulse duration-[8000ms]" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-pink-500/5 rounded-full blur-3xl -z-10 animate-pulse duration-[6000ms]" />

      <div className="w-full max-w-5xl glass-card p-6 md:p-8 space-y-8 relative overflow-hidden">
        {/* Glowing border outline */}
        <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/20 via-pink-500/10 to-indigo-500/20 opacity-30 pointer-events-none -z-10" />

        {/* Page Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-slate-800">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-xl shadow-lg shadow-indigo-500/20 animate-pulse">
                <Database className="h-6 w-6 text-white" />
              </div>
              <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
                One-Time Setup
              </h1>
            </div>
            <p className="text-slate-400 text-sm md:text-base max-w-2xl leading-relaxed">
              Marker requires localized AI models to execute document conversion and layout extraction.
              We are setting up your local environment.
            </p>
          </div>

          <div className="flex items-center gap-3 self-start md:self-auto">
            {isCompleted && (
              <Badge className="bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 px-3 py-1.5 rounded-full flex items-center gap-1.5 font-semibold text-sm">
                <CheckCircle2 className="h-4 w-4" /> Ready
              </Badge>
            )}
            {isDownloading && (
              <Badge className="bg-indigo-500/15 text-indigo-400 border border-indigo-500/30 px-3 py-1.5 rounded-full flex items-center gap-1.5 font-semibold text-sm animate-pulse">
                <Loader2 className="h-4 w-4 animate-spin" /> Downloading
              </Badge>
            )}
            {isLoading && (
              <Badge className="bg-amber-500/15 text-amber-400 border border-amber-500/30 px-3 py-1.5 rounded-full flex items-center gap-1.5 font-semibold text-sm animate-pulse">
                <Cpu className="h-4 w-4 animate-spin" /> Initializing Engine
              </Badge>
            )}
            {isFailed && (
              <Badge className="bg-rose-500/15 text-rose-400 border border-rose-500/30 px-3 py-1.5 rounded-full flex items-center gap-1.5 font-semibold text-sm">
                <XCircle className="h-4 w-4" /> Failed / Cancelled
              </Badge>
            )}
            {isPending && (
              <Badge className="bg-slate-800 text-slate-400 border border-slate-700 px-3 py-1.5 rounded-full flex items-center gap-1.5 font-semibold text-sm">
                <Download className="h-4 w-4" /> Waiting
              </Badge>
            )}
          </div>
        </div>

        {/* Failed / Cancelled State Message */}
        {isFailed && (
          <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-start gap-3 text-rose-300">
            <AlertTriangle className="h-5 w-5 mt-0.5 shrink-0" />
            <div className="space-y-1">
              <h4 className="font-bold">Setup Interrupted</h4>
              <p className="text-sm text-rose-400">
                {status.error || 'The setup process was stopped. Verify internet connection and retry.'}
              </p>
            </div>
          </div>
        )}

        {/* Overall Progress Block */}
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <span className="text-xs uppercase tracking-wider font-extrabold text-slate-500">
                Overall Setup Progress
              </span>
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-black tracking-tight">{overall.progress}%</span>
                {isDownloading && (
                  <span className="text-sm text-slate-400">
                    ({formatBytes(overall.downloaded_bytes)} of {formatBytes(overall.total_bytes)})
                  </span>
                )}
              </div>
            </div>

            {/* Speed & ETA */}
            {isDownloading && (
              <div className="flex items-center gap-6 bg-slate-950/40 border border-slate-800/40 rounded-xl px-4 py-2.5 self-start md:self-auto">
                <div className="space-y-0.5">
                  <span className="text-[10px] uppercase font-bold text-slate-500">Speed</span>
                  <p className="font-mono text-sm font-bold text-indigo-400">
                    {overall.speed.toFixed(1)} MB/s
                  </p>
                </div>
                <div className="w-px h-6 bg-slate-800" />
                <div className="space-y-0.5">
                  <span className="text-[10px] uppercase font-bold text-slate-500">Remaining</span>
                  <p className="font-mono text-sm font-bold text-violet-400">
                    {formatETA(overall.eta)}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Large Progress Bar */}
          <div className="relative">
            <Progress value={overall.progress} className="h-3.5 bg-slate-950 rounded-full" />
            {isDownloading && (
              <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/20 to-violet-500/20 blur-sm -z-10 rounded-full" />
            )}
          </div>
        </div>

        {/* Models Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Object.entries(status.models).map(([key, model]) => {
            const mStatus = model.status
            const isModelDone = mStatus === 'completed'
            const isModelDownloading = mStatus === 'downloading'
            const isModelFailed = mStatus === 'failed'

            return (
              <Card
                key={key}
                className={`bg-slate-900/35 border transition-all duration-300 ${
                  isModelDownloading
                    ? 'border-indigo-500/45 shadow-lg shadow-indigo-500/5 bg-slate-900/60'
                    : isModelDone
                    ? 'border-emerald-500/30 bg-slate-900/20'
                    : 'border-slate-800/80'
                }`}
              >
                <CardHeader className="p-4 pb-2 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base font-bold text-slate-200">
                      {model.name}
                    </CardTitle>
                    {isModelDone ? (
                      <CheckCircle2 className="h-4.5 w-4.5 text-emerald-400 shrink-0" />
                    ) : isModelDownloading ? (
                      <Loader2 className="h-4.5 w-4.5 text-indigo-400 animate-spin shrink-0" />
                    ) : isModelFailed ? (
                      <AlertTriangle className="h-4.5 w-4.5 text-rose-400 shrink-0" />
                    ) : (
                      <Download className="h-4 w-4 text-slate-600 shrink-0" />
                    )}
                  </div>
                  <CardDescription className="text-xs text-slate-400 leading-normal min-h-[36px]">
                    {modelDescriptions[key] || 'AI models used to power convert steps.'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-4 pt-2 space-y-2">
                  <Progress value={model.progress} className="h-1.5 bg-slate-950 rounded-full" />
                  <div className="flex items-center justify-between text-[10px] font-mono text-slate-500">
                    <span>{model.progress}%</span>
                    {model.total_bytes > 0 && (
                      <span>
                        {formatBytes(model.downloaded_bytes)} / {formatBytes(model.total_bytes)}
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>

        {/* Active Files Downloading Sub-list */}
        {isDownloading && (
          <div className="space-y-3 bg-slate-900/20 border border-slate-800/60 rounded-xl p-4">
            <h4 className="text-xs uppercase font-extrabold text-slate-500 tracking-wider flex items-center gap-1.5">
              <Download className="h-3.5 w-3.5 text-indigo-400 animate-bounce" /> Active Downloads
            </h4>
            <div className="max-h-28 overflow-y-auto space-y-2 pr-2">
              {Object.entries(status.models)
                .filter(([_, m]) => m.status === 'downloading')
                .map(([_, m]) =>
                  Object.entries(m.files)
                    .filter(([_, f]) => f.status === 'downloading')
                    .map(([file, f]) => (
                      <div
                        key={file}
                        className="flex items-center justify-between text-xs bg-slate-950/40 border border-slate-800/40 rounded-lg p-2.5 font-mono"
                      >
                        <span className="text-slate-300 truncate max-w-[60%]">{file}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-slate-500">
                            {formatBytes(f.downloaded_bytes)}
                            {f.total_bytes > 0 && ` / ${formatBytes(f.total_bytes)}`}
                          </span>
                          <Loader2 className="h-3.5 w-3.5 text-indigo-400 animate-spin" />
                        </div>
                      </div>
                    ))
                )}
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pt-6 border-t border-slate-800">
          <div className="text-slate-400 text-xs">
            {isCompleted && 'Installation finished. You are ready to start using Marker.'}
            {isDownloading && 'Downloading models to user datalab cache...'}
            {isLoading && 'Extracting files and loading parameters into memory. Please wait...'}
            {isFailed && 'Setup halted. Try checking your connection and restart the process.'}
            {isPending && 'Initiating setup process...'}
          </div>

          <div className="flex items-center gap-3 self-end md:self-auto">
            {isDownloading && (
              <Button
                variant="outline"
                onClick={handleCancel}
                disabled={isCancelling}
                className="border-slate-800 hover:border-slate-700 bg-slate-900/50 hover:bg-slate-900 text-slate-300 hover:text-white px-5 py-2.5 rounded-xl text-sm font-semibold"
              >
                {isCancelling ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> Cancelling
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
                className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl px-5 py-2.5 shadow-lg shadow-indigo-600/25 transition-all text-sm"
              >
                {isRetrying ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> Starting...
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 mr-1.5" /> Restart Setup
                  </>
                )}
              </Button>
            )}

            {isCompleted && (
              <Button
                onClick={onComplete}
                className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-extrabold rounded-xl px-6 py-3 shadow-lg shadow-emerald-500/20 animate-bounce transition-all text-sm flex items-center gap-1.5"
              >
                Continue to Workspace <ArrowRight className="h-4.5 w-4.5" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
