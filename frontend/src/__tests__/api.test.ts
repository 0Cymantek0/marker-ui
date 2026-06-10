import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  getApiToken,
  setApiToken,
  clearApiToken,
  hasApiToken,
  getJobEvents,
  downloadResult,
  deleteJob,
  getJobStatus,
} from '@/lib/api'

// ── Helpers ──────────────────────────────────────────────────────────

function mockFetchOnce(status: number, body: unknown, ok?: boolean) {
  return vi.mocked(global.fetch).mockResolvedValueOnce({
    status,
    ok: ok ?? (status >= 200 && status < 300),
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body)),
    blob: () => Promise.resolve(new Blob()),
    headers: new Headers(),
  } as Response)
}

function mockFetchResponse(responses: Array<{ status: number; body?: unknown }>) {
  return responses.map((r) =>
    vi.mocked(global.fetch).mockResolvedValueOnce({
      status: r.status,
      ok: r.status >= 200 && r.status < 300,
      json: () => Promise.resolve(r.body ?? {}),
      text: () => Promise.resolve(typeof r.body === 'string' ? r.body : JSON.stringify(r.body ?? {})),
      blob: () => Promise.resolve(new Blob()),
      headers: new Headers(),
    } as Response)
  )
}

// Track EventSource construction calls
const eventSourceUrls: string[] = []

// ── Setup ────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
  eventSourceUrls.length = 0

  // Mock prompt() to return null by default
  vi.spyOn(window, 'prompt').mockReturnValue(null)
  // Mock fetch
  vi.spyOn(global, 'fetch')

  // Mock EventSource as a proper constructable class
  vi.stubGlobal(
    'EventSource',
    class MockEventSource {
      addEventListener = vi.fn()
      close = vi.fn()
      onerror: (() => void) | null = null
      constructor(public readonly url: string) {
        eventSourceUrls.push(url)
      }
    } as unknown as typeof EventSource
  )
})

// ── Token management ─────────────────────────────────────────────────

describe('auth token management', () => {
  it('setApiToken stores token in localStorage', () => {
    setApiToken('my-secret-token')
    expect(localStorage.getItem('marker_api_token')).toBe('my-secret-token')
  })

  it('getApiToken retrieves token from localStorage', () => {
    localStorage.setItem('marker_api_token', 'stored-token')
    expect(getApiToken()).toBe('stored-token')
  })

  it('getApiToken returns empty string when no token', () => {
    expect(getApiToken()).toBe('')
  })

  it('clearApiToken removes token from localStorage', () => {
    localStorage.setItem('marker_api_token', 'some-token')
    clearApiToken()
    expect(localStorage.getItem('marker_api_token')).toBeNull()
    expect(getApiToken()).toBe('')
  })

  it('hasApiToken returns true when token exists', () => {
    setApiToken('exists')
    expect(hasApiToken()).toBe(true)
  })

  it('hasApiToken returns false when no token', () => {
    expect(hasApiToken()).toBe(false)
  })
})

// ── request() auth header (via public functions) ─────────────────────

describe('request() Authorization header', () => {
  it('includes Bearer token when token is set (via deleteJob)', async () => {
    setApiToken('test-token-456')
    mockFetchOnce(204, undefined)

    await deleteJob('job-789')

    const [, options] = vi.mocked(global.fetch).mock.calls[0] as [string, RequestInit]
    const headers = options.headers as Record<string, string>
    expect(headers['Authorization']).toBe('Bearer test-token-456')
  })

  it('includes Bearer token when token is set (via getJobStatus)', async () => {
    setApiToken('token-for-status')
    mockFetchOnce(200, { job_id: 'j-1', status: 'completed' })

    await getJobStatus('j-1')

    const [, options] = vi.mocked(global.fetch).mock.calls[0] as [string, RequestInit]
    const headers = options.headers as Record<string, string>
    expect(headers['Authorization']).toBe('Bearer token-for-status')
  })

  it('does NOT include Authorization header when no token', async () => {
    mockFetchOnce(200, { job_id: 'j-1', status: 'completed' })

    await getJobStatus('j-1')

    const [, options] = vi.mocked(global.fetch).mock.calls[0] as [string, RequestInit]
    const headers = options.headers as Record<string, string> | undefined
    expect(headers?.['Authorization']).toBeUndefined()
  })
})

// ── 401 retry ────────────────────────────────────────────────────────

describe('request() 401 handling', () => {
  it('prompts for token on 401 and retries the request', async () => {
    vi.spyOn(window, 'prompt').mockReturnValue('retry-token')

    mockFetchResponse([{ status: 401 }, { status: 204 }])

    await deleteJob('job-401')

    expect(window.prompt).toHaveBeenCalledWith(
      expect.stringContaining('Authentication required')
    )

    const calls = vi.mocked(global.fetch).mock.calls
    expect(calls.length).toBe(2)

    const [, secondOptions] = calls[1] as [string, RequestInit]
    const secondHeaders = secondOptions.headers as Record<string, string>
    expect(secondHeaders['Authorization']).toBe('Bearer retry-token')
  })

  it('throws when user cancels the prompt on 401', async () => {
    vi.spyOn(window, 'prompt').mockReturnValue(null)
    mockFetchOnce(401, 'Unauthorized')

    await expect(deleteJob('job-no-auth')).rejects.toThrow('Authentication required')
  })
})

// ── getJobEvents ─────────────────────────────────────────────────────

describe('getJobEvents EventSource URL', () => {
  it('includes token query param when token is set', () => {
    setApiToken('events-token')
    getJobEvents('job-events-1')

    expect(eventSourceUrls[0]).toContain('/api/convert/events/job-events-1?token=events-token')
  })

  it('does not include token param when no token', () => {
    getJobEvents('job-events-2')

    expect(eventSourceUrls[0]).toBe('/api/convert/events/job-events-2')
  })
})

// ── downloadResult ───────────────────────────────────────────────────

describe('downloadResult Authorization header', () => {
  it('includes Bearer token when set', async () => {
    setApiToken('download-token')
    mockFetchOnce(200, new Blob(), true)

    await downloadResult('job-dl-1')

    const [, options] = vi.mocked(global.fetch).mock.calls[0] as [string, RequestInit]
    const headers = options.headers as Record<string, string>
    expect(headers['Authorization']).toBe('Bearer download-token')
  })

  it('throws on 401', async () => {
    mockFetchOnce(401, 'Unauthorized')

    await expect(downloadResult('job-dl-2')).rejects.toThrow('Authentication required')
  })
})
