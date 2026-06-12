import { useState, useCallback, useRef } from 'react'
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

export interface ConversionState {
  phase: ConversionPhase
  progress: number
  statusText: string
  jobId: string | null
  error: string | null
  resultBlob: Blob | null
  logs: string[]
  outputFormat: string
  filename: string | null
}

const INITIAL_STATE: ConversionState = {
  phase: 'idle',
  progress: 0,
  statusText: '',
  jobId: null,
  error: null,
  resultBlob: null,
  logs: [],
  outputFormat: 'markdown',
  filename: null,
}

export function useConversion() {
  const [state, setState] = useState<ConversionState>(INITIAL_STATE)
  const eventSourceRef = useRef<EventSource | null>(null)

  const cancel = useCallback(async () => {
    const jobId = state.jobId  // capture before reset
    eventSourceRef.current?.close()
    eventSourceRef.current = null
    setState(INITIAL_STATE)

    // Tell the backend to cancel + clean up
    if (jobId) {
      try {
        await deleteJob(jobId)
      } catch {
        // Best effort — job may already be gone
      }
    }
  }, [state.jobId])

  const start = useCallback(
    async (file: File, config: ConversionConfig) => {
      cancel()

      setState({
        phase: 'uploading',
        progress: 0,
        statusText: 'Uploading file...',
        jobId: null,
        error: null,
        resultBlob: null,
        outputFormat: config.output_format,
        filename: file.name,
        logs: [
          `[SYSTEM] Initiating upload process for file: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`,
          '[SYSTEM] Preparing payload headers and checking connection...',
        ],
      })

      try {
        // Step 1: Upload
        const response = await uploadFile(file, config)

        setState((prev) => ({
          ...prev,
          phase: 'processing',
          jobId: response.job_id,
          outputFormat: config.output_format,
          progress: 5,
          statusText: 'Processing document...',
          logs: [
            ...prev.logs,
            `[SYSTEM] Upload completed successfully.`,
            `[SYSTEM] Job created with ID: ${response.job_id}`,
            `[SYSTEM] Opening Server-Sent Events (SSE) socket channel...`,
            `[SYSTEM] Model loading/retrieval initiated...`,
          ],
        }))

        // Step 2: Listen for SSE events
        const es = getJobEvents(response.job_id)
        eventSourceRef.current = es

        es.addEventListener('progress', (e) => {
          const data = e.data ? JSON.parse(e.data) : {}
          const messageStr = data.message || 'Executing conversion pipelines...'

          // Check for terminal status inside progress events
          if (data.status === 'completed') {
            es.close()
            eventSourceRef.current = null

            setState((prev) => ({
              ...prev,
              logs: [...prev.logs, '[SUCCESS] Conversion execution succeeded.', '[SYSTEM] Fetching result package...'],
            }))

            downloadResult(response.job_id)
              .then((blob) => {
                setState((prev) => ({
                  ...prev,
                  phase: 'completed',
                  progress: 100,
                  statusText: 'Conversion complete',
                  outputFormat: prev.outputFormat,
                  jobId: response.job_id,
                  error: null,
                  resultBlob: blob,
                  logs: [...prev.logs, '[SUCCESS] Result package successfully fetched and ready.'],
                }))
              })
              .catch((err) => {
                const msg = err instanceof Error ? err.message : 'Download failed'
                setState((prev) => ({
                  ...prev,
                  phase: 'completed',
                  progress: 100,
                  statusText: 'Conversion complete',
                  outputFormat: prev.outputFormat,
                  jobId: response.job_id,
                  error: null,
                  resultBlob: null,
                  logs: [...prev.logs, `[WARN] Failed to fetch result locally: ${msg}. Click download to try again.`],
                }))
              })
            return  // Don't update progress after handling completion
          }

          if (data.status === 'failed') {
            es.close()
            eventSourceRef.current = null

            setState((prev) => ({
              ...prev,
              phase: 'failed',
              error: data.error ?? 'Conversion failed',
              statusText: 'Conversion failed',
              logs: [
                ...prev.logs,
                `[ERROR] Conversion task failed: ${data.error ?? 'Unknown engine error.'}`,
              ],
            }))
            return  // Don't update progress after handling failure
          }

          // Normal progress update
          setState((prev) => {
            const nextLogs = [...prev.logs]
            // Only add if the message is unique or represents an actual step
            if (nextLogs[nextLogs.length - 1] !== `[INFO] ${messageStr}`) {
              nextLogs.push(`[INFO] ${messageStr}`)
            }
            return {
              ...prev,
              progress: Math.max(prev.progress, data.progress ?? prev.progress + 3),
              statusText: messageStr,
              logs: nextLogs,
            }
          })
        })

        es.addEventListener('status', (e) => {
          const data = e.data ? JSON.parse(e.data) : {}
          
          if (data.status === 'completed') {
            es.close()
            eventSourceRef.current = null

            setState((prev) => ({
              ...prev,
              logs: [...prev.logs, '[SUCCESS] Conversion execution succeeded.', '[SYSTEM] Fetching result package...'],
            }))

            // Download the result
            downloadResult(response.job_id)
              .then((blob) => {
                setState((prev) => ({
                  ...prev,
                  phase: 'completed',
                  progress: 100,
                  statusText: 'Conversion complete',
                  outputFormat: prev.outputFormat,
                  jobId: response.job_id,
                  error: null,
                  resultBlob: blob,
                  logs: [...prev.logs, '[SUCCESS] Result package successfully fetched and ready.'],
                }))
              })
              .catch((err) => {
                const msg = err instanceof Error ? err.message : 'Download failed'
                setState((prev) => ({
                  ...prev,
                  phase: 'completed',
                  progress: 100,
                  statusText: 'Conversion complete',
                  outputFormat: prev.outputFormat,
                  jobId: response.job_id,
                  error: null,
                  resultBlob: null,
                  logs: [...prev.logs, `[WARN] Failed to fetch zip locally: ${msg}. Click download to try again.`],
                }))
              })
          } else if (data.status === 'failed') {
            es.close()
            eventSourceRef.current = null
            
            setState((prev) => ({
              ...prev,
              phase: 'failed',
              error: data.error ?? 'Conversion failed',
              statusText: 'Conversion failed',
              logs: [
                ...prev.logs,
                `[ERROR] Conversion task failed: ${data.error ?? 'Unknown engine error.'}`,
              ],
            }))
          }
        })

        es.onerror = () => {
          es.close()
          eventSourceRef.current = null

          // Only poll if we were processing and have a job ID
          setState((prev) => {
            if (prev.phase === 'processing' && prev.jobId) {
              // Start polling for status
              const pollInterval = setInterval(async () => {
                try {
                  const status = await getJobStatus(prev.jobId!)
                  if (status.status === 'completed') {
                    clearInterval(pollInterval)
                    downloadResult(prev.jobId!)
                      .then((blob) => {
                        setState((prev) => ({
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
                        setState((prev) => ({
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
                    setState((prev) => ({
                      ...prev,
                      phase: 'failed',
                      error: status.error_message ?? 'Conversion failed',
                      statusText: 'Conversion failed',
                      logs: [...prev.logs, `[ERROR] SSE disconnected, polling detected failure: ${status.error_message ?? 'Unknown'}`],
                    }))
                  } else if (status.status === 'cancelled') {
                    clearInterval(pollInterval)
                    setState(INITIAL_STATE)
                  }
                } catch {
                  // Network error during polling — stop polling
                  clearInterval(pollInterval)
                  setState((prev) => ({
                    ...prev,
                    statusText: 'Connection lost. Please refresh.',
                    logs: [...prev.logs, '[WARN] SSE and polling both failed.'],
                  }))
                }
              }, 2000) // Poll every 2s

              return {
                ...prev,
                statusText: 'Connection lost — polling for status...',
                logs: [...prev.logs, '[WARN] SSE socket disconnected. Falling back to polling...'],
              }
            }
            return prev
          })
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : 'Upload failed'
        setState((prev) => ({
          ...prev,
          phase: 'failed',
          progress: 0,
          statusText: 'Upload failed',
          jobId: null,
          error: errMsg,
          resultBlob: null,
          outputFormat: prev.outputFormat,
          logs: [...prev.logs, `[ERROR] Network error during upload: ${errMsg}`],
        }))
      }
    },
    [cancel]
  )

  const download = useCallback(async () => {
    if (!state.jobId) return
    const blob = state.resultBlob ?? await downloadResult(state.jobId)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    // Inspect if the downloaded package is a ZIP bundle to avoid wrong extension naming
    const isZip = blob.type === 'application/zip'
    const extMap: Record<string, string> = { markdown: 'md', json: 'json', html: 'html', chunks: 'json' }
    const ext = isZip ? 'zip' : (extMap[state.outputFormat] || 'md')
    
    const stem = state.filename
      ? (state.filename.includes('.')
        ? state.filename.split('.').slice(0, -1).join('.')
        : state.filename)
      : 'output'
    a.download = `${stem}.${ext}`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [state.jobId, state.resultBlob, state.outputFormat, state.filename])

  const clearLogs = useCallback(() => {
    setState((prev) => ({
      ...prev,
      logs: [],
    }))
  }, [])

  return {
    state,
    start,
    cancel,
    download,
    clearLogs,
    isConverting: state.phase === 'uploading' || state.phase === 'processing',
  }
}
