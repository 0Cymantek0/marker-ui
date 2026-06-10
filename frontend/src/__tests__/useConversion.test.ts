import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useConversion } from '@/hooks/useConversion'
import type { ConversionConfig } from '@/lib/api'

// ── Mock api module (use vi.hoisted to avoid hoisting issue) ─────────

const {
  mockUploadFile,
  mockGetJobEvents,
  mockDownloadResult,
  mockDeleteJob,
  mockGetJobStatus,
} = vi.hoisted(() => ({
  mockUploadFile: vi.fn(),
  mockGetJobEvents: vi.fn(),
  mockDownloadResult: vi.fn(),
  mockDeleteJob: vi.fn(),
  mockGetJobStatus: vi.fn(),
}))

vi.mock('@/lib/api', () => ({
  uploadFile: mockUploadFile,
  getJobEvents: mockGetJobEvents,
  downloadResult: mockDownloadResult,
  deleteJob: mockDeleteJob,
  getJobStatus: mockGetJobStatus,
}))

// ── Mock EventSource helpers ─────────────────────────────────────────

interface MockEventSourceInstance {
  addEventListener: ReturnType<typeof vi.fn>
  close: ReturnType<typeof vi.fn>
  onerror: (() => void) | null
  _trigger: (event: string, data: Record<string, unknown>) => void
  _triggerError: () => void
}

function createMockEventSource(): MockEventSourceInstance {
  const listeners = new Map<string, Array<(e: { data: string }) => void>>()
  return {
    addEventListener: vi.fn(
      (event: string, handler: (e: { data: string }) => void) => {
        if (!listeners.has(event)) listeners.set(event, [])
        listeners.get(event)!.push(handler)
      }
    ),
    close: vi.fn(),
    onerror: null,
    _trigger(event: string, data: Record<string, unknown>) {
      const handlers = listeners.get(event) ?? []
      handlers.forEach((h) => h({ data: JSON.stringify(data) }))
    },
    _triggerError() {
      this.onerror?.()
    },
  }
}

let currentMockES: MockEventSourceInstance | null = null

// Track setInterval/clearInterval for polling tests
let pollCallback: (() => void) | null = null

beforeEach(() => {
  vi.resetAllMocks()
  currentMockES = null
  pollCallback = null

  mockGetJobEvents.mockImplementation(() => {
    const es = createMockEventSource()
    currentMockES = es
    return es
  })

  // Mock setInterval to capture the callback instead of scheduling it
  vi.stubGlobal(
    'setInterval',
    vi.fn((fn: () => void, _ms: number) => {
      pollCallback = fn
      return 42
    })
  )
  vi.stubGlobal('clearInterval', vi.fn())
})

// ── Helper: create a minimal file + config ───────────────────────────

const testFile = new File(['dummy'], 'test.pdf', { type: 'application/pdf' })
const testConfig: ConversionConfig = {
  output_format: 'markdown',
  converter: 'PdfConverter',
}

/** Creates a deferred promise with an external resolve handle */
function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void } {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

// ── Tests ────────────────────────────────────────────────────────────

describe('useConversion', () => {
  describe('state transitions: start()', () => {
    it('transitions from idle → uploading → processing on successful upload', async () => {
      const { promise: uploadPromise, resolve: resolveUpload } = deferred<any>()
      mockUploadFile.mockImplementation(() => uploadPromise)

      const { result } = renderHook(() => useConversion())

      expect(result.current.state.phase).toBe('idle')

      // Fire start inside act — but DON'T await the start() promise (upload hasn't resolved yet)
      act(() => {
        result.current.start(testFile, testConfig)
      })

      // After synchronous React state updates: should see 'uploading'
      expect(result.current.state.phase).toBe('uploading')
      expect(result.current.state.statusText).toBe('Uploading file...')

      // Now resolve the upload
      await act(async () => {
        resolveUpload({
          job_id: 'test-job-1',
          status: 'pending',
          filename: 'test.pdf',
        })
      })

      // Should transition to 'processing'
      await waitFor(() => {
        expect(result.current.state.phase).toBe('processing')
      })
      expect(result.current.state.jobId).toBe('test-job-1')
      expect(result.current.state.progress).toBe(5)
    })

    it('transitions to failed when uploadFile rejects', async () => {
      mockUploadFile.mockRejectedValueOnce(new Error('Network error'))
      const { result } = renderHook(() => useConversion())

      await act(async () => {
        await result.current.start(testFile, testConfig).catch(() => {})
      })

      await waitFor(() => {
        expect(result.current.state.phase).toBe('failed')
      })
      expect(result.current.state.error).toContain('Network error')
    })
  })

  describe('SSE progress events', () => {
    it('updates progress percentage on progress event', async () => {
      mockUploadFile.mockResolvedValue({
        job_id: 'test-job-1',
        status: 'pending',
        filename: 'test.pdf',
      })
      const { result } = renderHook(() => useConversion())

      await act(async () => {
        await result.current.start(testFile, testConfig)
      })

      await waitFor(() => {
        expect(result.current.state.phase).toBe('processing')
      })

      await act(() => {
        currentMockES!._trigger('progress', {
          progress: 42,
          message: 'Converting page 5...',
        })
      })

      expect(result.current.state.progress).toBe(42)
      expect(result.current.state.statusText).toBe('Converting page 5...')
    })

    it('transitions to completed on progress event with status=completed', async () => {
      mockUploadFile.mockResolvedValue({
        job_id: 'test-job-1',
        status: 'pending',
        filename: 'test.pdf',
      })
      mockDownloadResult.mockResolvedValueOnce(new Blob(['result']))
      const { result } = renderHook(() => useConversion())

      await act(async () => {
        await result.current.start(testFile, testConfig)
      })

      await waitFor(() => {
        expect(result.current.state.phase).toBe('processing')
      })

      await act(() => {
        currentMockES!._trigger('progress', { status: 'completed', message: 'Done' })
      })

      await waitFor(() => {
        expect(result.current.state.phase).toBe('completed')
      })
      expect(result.current.state.progress).toBe(100)
      expect(result.current.state.statusText).toBe('Conversion complete')
      expect(mockDownloadResult).toHaveBeenCalledWith('test-job-1')
    })

    it('transitions to failed on progress event with status=failed', async () => {
      mockUploadFile.mockResolvedValue({
        job_id: 'test-job-1',
        status: 'pending',
        filename: 'test.pdf',
      })
      const { result } = renderHook(() => useConversion())

      await act(async () => {
        await result.current.start(testFile, testConfig)
      })

      await waitFor(() => {
        expect(result.current.state.phase).toBe('processing')
      })

      await act(() => {
        currentMockES!._trigger('progress', {
          status: 'failed',
          error: 'Model crashed',
        })
      })

      await waitFor(() => {
        expect(result.current.state.phase).toBe('failed')
      })
      expect(result.current.state.error).toBe('Model crashed')
      expect(result.current.state.statusText).toBe('Conversion failed')
    })
  })

  describe('SSE status events', () => {
    it('transitions to completed on status event with completed', async () => {
      mockUploadFile.mockResolvedValue({
        job_id: 'test-job-1',
        status: 'pending',
        filename: 'test.pdf',
      })
      mockDownloadResult.mockResolvedValueOnce(new Blob(['output']))
      const { result } = renderHook(() => useConversion())

      await act(async () => {
        await result.current.start(testFile, testConfig)
      })

      await waitFor(() => {
        expect(result.current.state.phase).toBe('processing')
      })

      await act(() => {
        currentMockES!._trigger('status', { status: 'completed' })
      })

      await waitFor(() => {
        expect(result.current.state.phase).toBe('completed')
      })
      expect(mockDownloadResult).toHaveBeenCalledWith('test-job-1')
    })

    it('transitions to failed on status event with failed', async () => {
      mockUploadFile.mockResolvedValue({
        job_id: 'test-job-1',
        status: 'pending',
        filename: 'test.pdf',
      })
      const { result } = renderHook(() => useConversion())

      await act(async () => {
        await result.current.start(testFile, testConfig)
      })

      await waitFor(() => {
        expect(result.current.state.phase).toBe('processing')
      })

      await act(() => {
        currentMockES!._trigger('status', {
          status: 'failed',
          error: 'Out of memory',
        })
      })

      await waitFor(() => {
        expect(result.current.state.phase).toBe('failed')
      })
      expect(result.current.state.error).toBe('Out of memory')
    })
  })

  describe('cancel()', () => {
    it('calls deleteJob with the current jobId', async () => {
      mockUploadFile.mockResolvedValue({
        job_id: 'test-job-1',
        status: 'pending',
        filename: 'test.pdf',
      })
      mockDeleteJob.mockResolvedValueOnce(undefined)
      const { result } = renderHook(() => useConversion())

      await act(async () => {
        await result.current.start(testFile, testConfig)
      })

      await waitFor(() => {
        expect(result.current.state.phase).toBe('processing')
      })

      await act(async () => {
        await result.current.cancel()
      })

      expect(mockDeleteJob).toHaveBeenCalledWith('test-job-1')
      expect(result.current.state.phase).toBe('idle')
      expect(result.current.state.jobId).toBeNull()
    })

    it('closes the EventSource on cancel', async () => {
      mockUploadFile.mockResolvedValue({
        job_id: 'test-job-1',
        status: 'pending',
        filename: 'test.pdf',
      })
      const { result } = renderHook(() => useConversion())

      await act(async () => {
        await result.current.start(testFile, testConfig)
      })

      await waitFor(() => {
        expect(result.current.state.phase).toBe('processing')
      })

      const es = currentMockES!
      await act(async () => {
        await result.current.cancel()
      })

      expect(es.close).toHaveBeenCalled()
    })

    it('handles cancel when no job is in progress (noop)', async () => {
      const { result } = renderHook(() => useConversion())

      await act(async () => {
        await result.current.cancel()
      })

      expect(mockDeleteJob).not.toHaveBeenCalled()
      expect(result.current.state.phase).toBe('idle')
    })
  })

  describe('download()', () => {
    it('creates correct file extension for markdown output', async () => {
      mockUploadFile.mockResolvedValue({
        job_id: 'test-job-1',
        status: 'pending',
        filename: 'test.pdf',
      })
      mockDownloadResult.mockResolvedValueOnce(new Blob(['md content']))
      const { result } = renderHook(() => useConversion())

      await act(async () => {
        await result.current.start(testFile, testConfig)
      })

      await waitFor(() => {
        expect(result.current.state.phase).toBe('processing')
      })

      const appendSpy = vi.spyOn(document.body, 'appendChild')
      const removeSpy = vi.spyOn(document.body, 'removeChild')
      const createUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test')
      const revokeUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})

      await act(async () => {
        await result.current.download()
      })

      const anchor = appendSpy.mock.calls[0]?.[0] as HTMLAnchorElement
      expect(anchor).toBeTruthy()
      expect(anchor.download).toBe('marker-output-test-job-1.md')
      expect(anchor.href).toBe('blob:test')
      expect(removeSpy).toHaveBeenCalledWith(anchor)
      expect(revokeUrl).toHaveBeenCalledWith('blob:test')

      appendSpy.mockRestore()
      removeSpy.mockRestore()
      createUrl.mockRestore()
      revokeUrl.mockRestore()
    })

    it('creates .json extension for json output', async () => {
      mockUploadFile.mockResolvedValue({
        job_id: 'test-job-1',
        status: 'pending',
        filename: 'test.pdf',
      })
      mockDownloadResult.mockResolvedValueOnce(new Blob(['{}']))
      const { result } = renderHook(() => useConversion())

      await act(async () => {
        result.current.start(testFile, { ...testConfig, output_format: 'json' })
      })

      await waitFor(() => {
        expect(result.current.state.phase).toBe('processing')
      })

      const appendSpy = vi.spyOn(document.body, 'appendChild')
      const createUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:json')

      await act(async () => {
        await result.current.download()
      })

      const anchor = appendSpy.mock.calls[0]?.[0] as HTMLAnchorElement
      expect(anchor.download).toBe('marker-output-test-job-1.json')

      appendSpy.mockRestore()
      createUrl.mockRestore()
    })

    it('creates .html extension for html output', async () => {
      mockUploadFile.mockResolvedValue({
        job_id: 'test-job-1',
        status: 'pending',
        filename: 'test.pdf',
      })
      mockDownloadResult.mockResolvedValueOnce(new Blob(['<html>']))
      const { result } = renderHook(() => useConversion())

      await act(async () => {
        result.current.start(testFile, { ...testConfig, output_format: 'html' })
      })

      await waitFor(() => {
        expect(result.current.state.phase).toBe('processing')
      })

      const appendSpy = vi.spyOn(document.body, 'appendChild')
      const createUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:html')

      await act(async () => {
        await result.current.download()
      })

      const anchor = appendSpy.mock.calls[0]?.[0] as HTMLAnchorElement
      expect(anchor.download).toBe('marker-output-test-job-1.html')

      appendSpy.mockRestore()
      createUrl.mockRestore()
    })

    it('creates .json extension for chunks output', async () => {
      mockUploadFile.mockResolvedValue({
        job_id: 'test-job-1',
        status: 'pending',
        filename: 'test.pdf',
      })
      mockDownloadResult.mockResolvedValueOnce(new Blob(['{}']))
      const { result } = renderHook(() => useConversion())

      await act(async () => {
        result.current.start(testFile, { ...testConfig, output_format: 'chunks' })
      })

      await waitFor(() => {
        expect(result.current.state.phase).toBe('processing')
      })

      const appendSpy = vi.spyOn(document.body, 'appendChild')
      const createUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:chunks')

      await act(async () => {
        await result.current.download()
      })

      const anchor = appendSpy.mock.calls[0]?.[0] as HTMLAnchorElement
      expect(anchor.download).toBe('marker-output-test-job-1.json')

      appendSpy.mockRestore()
      createUrl.mockRestore()
    })

    it('is a noop when no jobId is set', async () => {
      const { result } = renderHook(() => useConversion())

      const fetchSpy = vi.spyOn(global, 'fetch')
      await act(async () => {
        await result.current.download()
      })

      expect(fetchSpy).not.toHaveBeenCalled()
    })
  })

  describe('SSE onerror polling fallback', () => {
    it('starts polling loop when SSE onerror fires', async () => {
      mockUploadFile.mockResolvedValue({
        job_id: 'test-job-1',
        status: 'pending',
        filename: 'test.pdf',
      })
      mockGetJobStatus.mockResolvedValue({
        id: 'test-job-1',
        job_id: 'test-job-1',
        status: 'pending',
        progress: 50,
        filename: 'test.pdf',
        output_format: 'markdown',
        converter: 'PdfConverter',
        created_at: new Date().toISOString(),
        completed_at: null,
        error_message: null,
        result_text: null,
      })

      const { result } = renderHook(() => useConversion())

      await act(async () => {
        await result.current.start(testFile, testConfig)
      })

      await waitFor(() => {
        expect(result.current.state.phase).toBe('processing')
      })

      // Trigger SSE onerror
      await act(() => {
        currentMockES!._triggerError()
      })

      expect(result.current.state.statusText).toContain('polling')

      // The mock setInterval should have captured the polling callback
      expect(pollCallback).toBeTruthy()

      // Invoke the polling callback manually
      await act(async () => {
        await (pollCallback as () => Promise<void>)()
      })

      expect(mockGetJobStatus).toHaveBeenCalledWith('test-job-1')
    })

    it('recovers via polling when getJobStatus returns completed', async () => {
      mockUploadFile.mockResolvedValue({
        job_id: 'test-job-1',
        status: 'pending',
        filename: 'test.pdf',
      })
      mockGetJobStatus.mockResolvedValue({
        id: 'test-job-1',
        job_id: 'test-job-1',
        status: 'completed',
        progress: 100,
        filename: 'test.pdf',
        output_format: 'markdown',
        converter: 'PdfConverter',
        created_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        error_message: null,
        result_text: null,
      })
      mockDownloadResult.mockResolvedValueOnce(new Blob(['polled result']))

      const { result } = renderHook(() => useConversion())

      await act(async () => {
        await result.current.start(testFile, testConfig)
      })

      await waitFor(() => {
        expect(result.current.state.phase).toBe('processing')
      })

      // Trigger SSE onerror
      await act(() => {
        currentMockES!._triggerError()
      })

      // Invoke the polling callback
      await act(async () => {
        await (pollCallback as () => Promise<void>)()
      })

      await waitFor(() => {
        expect(result.current.state.phase).toBe('completed')
      })
      expect(result.current.state.progress).toBe(100)
      expect(result.current.state.statusText).toBe('Conversion complete')
      expect(mockDownloadResult).toHaveBeenCalledWith('test-job-1')
    })

    it('recovers via polling when getJobStatus returns failed', async () => {
      mockUploadFile.mockResolvedValue({
        job_id: 'test-job-1',
        status: 'pending',
        filename: 'test.pdf',
      })
      mockGetJobStatus.mockResolvedValue({
        id: 'test-job-1',
        job_id: 'test-job-1',
        status: 'failed',
        progress: 50,
        filename: 'test.pdf',
        output_format: 'markdown',
        converter: 'PdfConverter',
        created_at: new Date().toISOString(),
        completed_at: null,
        error_message: 'Processing error',
        result_text: null,
      })

      const { result } = renderHook(() => useConversion())

      await act(async () => {
        await result.current.start(testFile, testConfig)
      })

      await waitFor(() => {
        expect(result.current.state.phase).toBe('processing')
      })

      await act(() => {
        currentMockES!._triggerError()
      })

      await act(async () => {
        await (pollCallback as () => Promise<void>)()
      })

      await waitFor(() => {
        expect(result.current.state.phase).toBe('failed')
      })
      expect(result.current.state.error).toContain('Processing error')
    })
  })

  describe('isConverting helper', () => {
    it('returns true during uploading phase', async () => {
      const { promise: uploadPromise } = deferred<any>()
      mockUploadFile.mockImplementation(() => uploadPromise)

      const { result } = renderHook(() => useConversion())

      act(() => {
        result.current.start(testFile, testConfig)
      })

      expect(result.current.isConverting).toBe(true)
    })

    it('returns false in idle phase', () => {
      const { result } = renderHook(() => useConversion())
      expect(result.current.isConverting).toBe(false)
    })
  })
})
