import { useState, useEffect, useCallback } from 'react'
import {
  getSettings,
  updateSetting,
  getLLMConfig,
  updateLLMConfig,
  type SettingsResponse,
  type LLMConfig,
} from '@/lib/api'

// ─── Generic mutation hook ───────────────────────────────────────────

export function useMutation<TData, TVariables>(
  mutationFn: (variables: TVariables) => Promise<TData>
) {
  const [isPending, setIsPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const mutate = useCallback(
    async (variables: TVariables): Promise<TData | undefined> => {
      setIsPending(true)
      setError(null)
      try {
        const data = await mutationFn(variables)
        return data
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        setError(msg)
        return undefined
      } finally {
        setIsPending(false)
      }
    },
    [mutationFn]
  )

  return { mutate, isPending, error, reset: () => setError(null) }
}

// ─── Settings hook ───────────────────────────────────────────────────

export function useSettings() {
  const [settings, setSettings] = useState<SettingsResponse[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchSettings = useCallback(async () => {
    setIsLoading(true)
    try {
      const data = await getSettings()
      setSettings(data)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load settings')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchSettings()
  }, [fetchSettings])

  const saveSetting = useMutation(
    async ({ key, value, category }: { key: string; value: string; category: string }) => {
      await updateSetting(key, value, category)
      // Optimistically update local cache
      setSettings((prev) =>
        prev.map((s) => (s.key === key ? { ...s, value } : s))
      )
    }
  )

  return {
    settings,
    isLoading,
    error,
    refetch: fetchSettings,
    saveSetting,
  }
}

// ─── LLM Config hook ─────────────────────────────────────────────────

export function useLLMConfig() {
  const [config, setConfig] = useState<LLMConfig | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchConfig = useCallback(async () => {
    setIsLoading(true)
    try {
      const data = await getLLMConfig()
      setConfig(data)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load LLM config')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchConfig()
  }, [fetchConfig])

  const saveConfig = useMutation(async (newConfig: LLMConfig) => {
    await updateLLMConfig(newConfig)
    setConfig(newConfig)
  })

  return {
    config,
    isLoading,
    error,
    refetch: fetchConfig,
    saveConfig,
  }
}
