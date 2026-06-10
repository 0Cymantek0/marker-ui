import { useState, useEffect, useCallback, useRef } from 'react'

interface SSEState<T> {
  data: T | null
  error: string | null
  isConnected: boolean
}

export function useSSE<T = string>(url: string, enabled = true) {
  const [state, setState] = useState<SSEState<T>>({
    data: null,
    error: null,
    isConnected: false,
  })
  const esRef = useRef<EventSource | null>(null)
  const reconnectTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const reconnectAttempts = useRef(0)

  const connect = useCallback(() => {
    if (!enabled || !url) return

    // Clean up existing connection
    esRef.current?.close()

    const es = new EventSource(url)
    esRef.current = es

    es.onopen = () => {
      reconnectAttempts.current = 0
      setState((prev) => ({ ...prev, isConnected: true, error: null }))
    }

    es.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data) as T
        setState((prev) => ({ ...prev, data: parsed }))
      } catch {
        setState((prev) => ({ ...prev, data: event.data as T }))
      }
    }

    es.onerror = () => {
      es.close()
      setState((prev) => ({ ...prev, isConnected: false }))

      // Auto-reconnect with exponential backoff (max 5 attempts)
      if (reconnectAttempts.current < 5) {
        const delay = Math.min(1000 * 2 ** reconnectAttempts.current, 16000)
        reconnectAttempts.current += 1
        reconnectTimeout.current = setTimeout(connect, delay)
      } else {
        setState((prev) => ({
          ...prev,
          error: 'Connection lost. Please refresh the page.',
        }))
      }
    }
  }, [url, enabled])

  useEffect(() => {
    connect()

    return () => {
      esRef.current?.close()
      esRef.current = null
      if (reconnectTimeout.current) {
        clearTimeout(reconnectTimeout.current)
      }
    }
  }, [connect])

  const reconnect = useCallback(() => {
    reconnectAttempts.current = 0
    connect()
  }, [connect])

  return {
    data: state.data,
    error: state.error,
    isConnected: state.isConnected,
    reconnect,
  }
}
