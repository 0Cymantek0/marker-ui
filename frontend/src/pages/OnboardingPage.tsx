import { useEffect, useState } from 'react'
import {
  getModelsStatus,
  cancelModelsDownload,
  retryModelsDownload,
  ModelTrackerStatus,
} from '@/lib/api'
import { CanvasConfetti } from '@/components/ui/CanvasConfetti'
import { EngineConsole } from '@/components/features/onboarding/EngineConsole'
import { DeveloperConsole } from '@/components/features/onboarding/DeveloperConsole'
import { PipelineVisualizer } from '@/components/features/onboarding/PipelineVisualizer'
import { Loader2, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'

interface OnboardingPageProps {
  onComplete: () => void
}

export function OnboardingPage({ onComplete }: OnboardingPageProps) {
  const [status, setStatus] = useState<ModelTrackerStatus | null>(null)
  const [isCancelling, setIsCancelling] = useState(false)
  const [isRetrying, setIsRetrying] = useState(false)
  const [showConfetti, setShowConfetti] = useState(false)
  const [firstLoadCheck, setFirstLoadCheck] = useState(true)
  const [startedWithCompleted, setStartedWithCompleted] = useState<boolean | null>(null)

  useEffect(() => {
    let timer: NodeJS.Timeout

    const pollStatus = async () => {
      try {
        const data = await getModelsStatus()
        setStatus(data)

        if (firstLoadCheck) {
          setFirstLoadCheck(false)
          if (data.initialized) {
            onComplete()
            return
          }
          if (data.overall.status === 'completed') {
            setStartedWithCompleted(true)
            onComplete()
            return
          } else {
            setStartedWithCompleted(false)
          }
        } else {
          if (data.initialized) {
            setShowConfetti(true)
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

    void pollStatus()

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
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950 text-slate-100 p-6 select-none font-sans">
        <Loader2 className="h-8 w-8 text-violet-500 animate-spin mb-4" />
        <p className="text-slate-400 font-medium text-xs uppercase tracking-wider">
          Connecting to Marker engine...
        </p>
      </div>
    )
  }

  const isFailed = status.overall.status === 'failed'

  return (
    <div className="relative min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4 md:p-8 overflow-hidden font-sans">
      {showConfetti && <CanvasConfetti />}

      {/* Ambient background glows */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-violet-600/5 rounded-full blur-[100px] -z-10 animate-pulse duration-[8000ms]" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-indigo-500/5 rounded-full blur-[100px] -z-10 animate-pulse duration-[6000ms]" />

      <div className="w-full max-w-6xl space-y-8 relative py-6 md:py-10 px-4 md:px-6">
        {/* Failed / Interrupt Alert banner */}
        {isFailed && (
          <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-start gap-3 text-rose-400 animate-fade-in select-none">
            <AlertTriangle className="h-5 w-5 mt-0.5 shrink-0" />
            <div className="space-y-1">
              <h4 className="font-bold text-sm">Setup Interrupted</h4>
              <p className="text-xs text-rose-400/90 leading-relaxed">
                {status.error || 'The setup process was stopped. Verify internet connection and retry.'}
              </p>
            </div>
          </div>
        )}

        {/* Responsive Dual-Panel grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-16 items-start">
          {/* Left Column (Console / Control) */}
          <div className="lg:col-span-5 space-y-8">
            <EngineConsole
              status={status}
              isCancelling={isCancelling}
              isRetrying={isRetrying}
              handleCancel={handleCancel}
              handleRetry={handleRetry}
              onComplete={onComplete}
            />
            
            <DeveloperConsole status={status} />
          </div>

          {/* Right Column (Pipeline Visualizer) */}
          <div className="lg:col-span-7 py-2">
            <PipelineVisualizer models={status.models} />
          </div>
        </div>
      </div>
    </div>
  )
}
