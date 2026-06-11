import React, { createContext, useContext, useState, useCallback } from 'react'
import {
  uploadFile,
  getJobEvents,
  getJobStatus,
  downloadResult,
  deleteJob,
  type ConversionConfig,
} from '@/lib/api'

export type ConversionPhase =
  | 'idle'
  | 'uploading'
  | 'processing'
  | 'completed'
  | 'failed'

export interface JobState {
  id: string // client-side unique ID
  filename: string
  file: File | null
  localPath: string
  phase: ConversionPhase
  progress: number
  statusText: string
  jobId: string | null
  error: string | null
  resultBlob: Blob | null
  logs: string[]
  outputFormat: string
  outputDir?: string
  elapsed?: number
  eta?: number
}

interface ConversionContextType {
  jobs: JobState[]
  start: (files: File[], localPaths: string[], config: ConversionConfig, outputDir?: string) => Promise<void>
  cancel: (id: string) => Promise<void>
  download: (id: string) => Promise<void>
  clearLogs: (id: string) => void
  removeJob: (id: string) => void
}

const ConversionContext = createContext<ConversionContextType | null>(null)

export function ConversionProvider({ children }: { children: React.ReactNode }) {
  const [jobs, setJobs] = useState<JobState[]>([])

  const updateJob = useCallback((id: string, updater: Partial<JobState> | ((prev: JobState) => JobState)) => {
    setJobs((prevJobs) =>
      prevJobs.map((j) => {
        if (j.id !== id) return j
        const next = typeof updater === 'function' ? updater(j) : { ...j, ...updater }
        return next
      })
    )
  }, [])

  const handleJobCompleted = useCallback((id: string, jobId: string) => {
    updateJob(id, (prev) => ({
      ...prev,
      logs: [...prev.logs, '[SUCCESS] Conversion execution succeeded.', '[SYSTEM] Fetching result package...'],
    }))

    downloadResult(jobId)
      .then((blob) => {
        updateJob(id, (prev) => ({
          ...prev,
          phase: 'completed',
          progress: 100,
          statusText: 'Conversion complete',
          error: null,
          resultBlob: blob,
          logs: [...prev.logs, '[SUCCESS] Result package successfully fetched and ready.'],
        }))
      })
      .catch((err) => {
        const msg = err instanceof Error ? err.message : 'Download failed'
        updateJob(id, (prev) => ({
          ...prev,
          phase: 'completed',
          progress: 100,
          statusText: 'Conversion complete',
          error: null,
          resultBlob: null,
          logs: [...prev.logs, `[WARN] Failed to fetch result locally: ${msg}. Click download to try again.`],
        }))
      })
  }, [updateJob])

  const handleJobFailed = useCallback((id: string, error: string) => {
    updateJob(id, (prev) => ({
      ...prev,
      phase: 'failed',
      error: error,
      statusText: 'Conversion failed',
      logs: [...prev.logs, `[ERROR] Conversion task failed: ${error}`],
    }))
  }, [updateJob])

  const handleJobSSEDisconnected = useCallback((id: string, jobId: string) => {
    updateJob(id, (prev) => ({
      ...prev,
      statusText: 'Connection lost — polling for status...',
      logs: [...prev.logs, '[WARN] SSE socket disconnected. Falling back to polling...'],
    }))

    const pollInterval = setInterval(async () => {
      try {
        const status = await getJobStatus(jobId)
        if (status.status === 'completed') {
          clearInterval(pollInterval)
          downloadResult(jobId)
            .then((blob) => {
              updateJob(id, (prev) => ({
                ...prev,
                phase: 'completed',
                progress: 100,
                statusText: 'Conversion complete',
                error: null,
                resultBlob: blob,
                logs: [...prev.logs, '[SUCCESS] SSE disconnected, recovered via polling.'],
              }))
            })
            .catch(() => {
              updateJob(id, (prev) => ({
                ...prev,
                phase: 'completed',
                progress: 100,
                statusText: 'Conversion complete',
                error: null,
                resultBlob: null,
                logs: [...prev.logs, '[WARN] SSE disconnected. Polling recovered but download failed.'],
              }))
            })
        } else if (status.status === 'failed') {
          clearInterval(pollInterval)
          updateJob(id, (prev) => ({
            ...prev,
            phase: 'failed',
            error: status.error_message ?? 'Conversion failed',
            statusText: 'Conversion failed',
            logs: [...prev.logs, `[ERROR] SSE disconnected, polling detected failure: ${status.error_message ?? 'Unknown'}`],
          }))
        } else if (status.status === 'cancelled') {
          clearInterval(pollInterval)
          updateJob(id, (prev) => ({
            ...prev,
            phase: 'failed',
            statusText: 'Cancelled',
            logs: [...prev.logs, '[SYSTEM] Job was cancelled on the backend.'],
          }))
        }
      } catch {
        // Network error during polling — keep trying
      }
    }, 3000)
  }, [updateJob])

  const runJob = useCallback(async (job: JobState, config: ConversionConfig, outputDir?: string) => {
    console.log("HOOK RUNJOB CALLED FOR:", job.id, "filename:", job.filename)
    updateJob(job.id, {
      phase: job.file ? 'uploading' : 'processing',
      progress: job.file ? 5 : 10,
      statusText: job.file ? 'Uploading file...' : 'Submitting local file path...',
      logs: job.file ? [
        `[SYSTEM] Initiating upload process for file: ${job.filename} (${(job.file.size / 1024 / 1024).toFixed(2)} MB)`,
        '[SYSTEM] Preparing payload headers and checking connection...',
      ] : [
        `[SYSTEM] Initiating conversion for local file: ${job.localPath}`,
        `[SYSTEM] Checking backend file system availability...`,
      ]
    })

    try {
      const response = await uploadFile(
        job.file,
        config,
        job.localPath || undefined,
        outputDir || undefined
      )

      updateJob(job.id, (prev) => ({
        ...prev,
        phase: 'processing',
        jobId: response.job_id,
        progress: 15,
        statusText: 'Processing document...',
        logs: [
          ...prev.logs,
          job.file ? `[SYSTEM] Upload completed successfully.` : `[SYSTEM] Local path accepted by backend.`,
          `[SYSTEM] Job created with ID: ${response.job_id}`,
          `[SYSTEM] Opening Server-Sent Events (SSE) socket channel...`,
          `[SYSTEM] Model loading/retrieval initiated...`,
        ]
      }))

      const es = getJobEvents(response.job_id)

      es.addEventListener('progress', (e) => {
        const data = e.data ? JSON.parse(e.data) : {}
        const messageStr = data.message || 'Executing conversion pipelines...'

        if (data.status === 'completed') {
          es.close()
          handleJobCompleted(job.id, response.job_id)
          return
        }

        if (data.status === 'failed') {
          es.close()
          handleJobFailed(job.id, data.error ?? 'Conversion failed')
          return
        }

        updateJob(job.id, (prev) => {
          const nextLogs = [...prev.logs]
          if (data.logs && data.logs.length > 0) {
            data.logs.forEach((log: string) => {
              if (!nextLogs.includes(log)) {
                nextLogs.push(log)
              }
            })
          } else if (messageStr && nextLogs[nextLogs.length - 1] !== `[INFO] ${messageStr}`) {
            nextLogs.push(`[INFO] ${messageStr}`)
          }
          return {
            ...prev,
            progress: Math.max(prev.progress, data.progress ?? prev.progress),
            statusText: messageStr,
            logs: nextLogs,
            elapsed: data.elapsed,
            eta: data.eta,
          }
        })
      })

      es.addEventListener('status', (e) => {
        const data = e.data ? JSON.parse(e.data) : {}
        if (data.status === 'completed') {
          es.close()
          handleJobCompleted(job.id, response.job_id)
        } else if (data.status === 'failed') {
          es.close()
          handleJobFailed(job.id, data.error ?? 'Conversion failed')
        }
      })

      es.onerror = () => {
        es.close()
        handleJobSSEDisconnected(job.id, response.job_id)
      }

    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Upload failed'
      updateJob(job.id, (prev) => ({
        ...prev,
        phase: 'failed',
        progress: 0,
        statusText: 'Upload/Submission failed',
        error: errMsg,
        logs: [...prev.logs, `[ERROR] Network error: ${errMsg}`],
      }))
    }
  }, [updateJob, handleJobCompleted, handleJobFailed, handleJobSSEDisconnected])

  const start = useCallback(async (files: File[], localPaths: string[], config: ConversionConfig, outputDir?: string) => {
    const newJobs: JobState[] = []

    // Add files
    for (const f of files) {
      const id = 'file-' + Math.random().toString(36).substring(2, 9)
      newJobs.push({
        id,
        filename: f.name,
        file: f,
        localPath: '',
        phase: 'idle',
        progress: 0,
        statusText: 'Queued',
        jobId: null,
        error: null,
        resultBlob: null,
        logs: [],
        outputFormat: config.output_format,
        outputDir,
      })
    }

    // Add local paths
    for (const lp of localPaths) {
      const cleanPath = lp.trim()
      if (!cleanPath) continue
      const id = 'local-' + Math.random().toString(36).substring(2, 9)
      const filename = cleanPath.split(/[/\\]/).pop() || cleanPath
      newJobs.push({
        id,
        filename,
        file: null,
        localPath: cleanPath,
        phase: 'idle',
        progress: 0,
        statusText: 'Queued',
        jobId: null,
        error: null,
        resultBlob: null,
        logs: [],
        outputFormat: config.output_format,
        outputDir,
      })
    }

    setJobs((prev) => [...prev, ...newJobs])

    // Run each job in background
    for (const job of newJobs) {
      void runJob(job, config, outputDir)
    }
  }, [runJob])

  const cancel = useCallback(async (id: string) => {
    setJobs((prevJobs) => {
      const job = prevJobs.find((j) => j.id === id)
      if (!job) return prevJobs

      if (job.jobId) {
        deleteJob(job.jobId).catch(() => {})
      }

      return prevJobs.map((j) => {
        if (j.id !== id) return j
        return {
          ...j,
          phase: 'failed',
          statusText: 'Cancelled',
          logs: [...j.logs, '[SYSTEM] Cancel request submitted.'],
        }
      })
    })
  }, [])

  const download = useCallback(async (id: string) => {
    const job = jobs.find((j) => j.id === id)
    if (!job || !job.jobId) return

    const blob = job.resultBlob ?? await downloadResult(job.jobId)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    
    const isZip = blob.type === 'application/zip'
    const extMap: Record<string, string> = { markdown: 'md', json: 'json', html: 'html', chunks: 'json' }
    const ext = isZip ? 'zip' : (extMap[job.outputFormat] || 'md')
    
    a.download = `marker-output-${job.jobId}.${ext}`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [jobs])

  const clearLogs = useCallback((id: string) => {
    updateJob(id, { logs: [] })
  }, [updateJob])

  const removeJob = useCallback((id: string) => {
    setJobs((prev) => prev.filter((j) => j.id !== id))
  }, [])

  return (
    <ConversionContext.Provider value={{ jobs, start, cancel, download, clearLogs, removeJob }}>
      {children}
    </ConversionContext.Provider>
  )
}

export function useConversionQueue() {
  const context = useContext(ConversionContext)
  if (!context) {
    throw new Error('useConversionQueue must be used within a ConversionProvider')
  }
  return context
}
