import { useState, useEffect } from 'react'
import {
  Save,
  TestTube,
  Loader2,
  Cpu,
  Sparkles,
  Brain,
  MessageSquare,
  Server,
  Cloud,
  Database,
  CheckCircle2,
  AlertTriangle,
  Key,
  Globe,
  Sliders,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  X,
  Settings,
  ListPlus,
  Activity,
  Trash,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Select } from '@/components/ui/select'
import {
  getSettings,
  getGPUStatus,
  installGPU,
  toggleGPU,
  getLLMProviders,
  saveLLMProviders,
  getActiveLLM,
  setActiveLLM,
  fetchAvailableModels,
  type LLMProvider,
  type ModelConfig,
  type ActiveLLM,
  type GPUStatus,
} from '@/lib/api'
import { cn } from '@/lib/utils'

// Helper to map provider types to icons
function ProviderIcon({ type, className }: { type: string; className?: string }) {
  switch (type) {
    case 'gemini': return <Sparkles className={className} />
    case 'claude': return <Brain className={className} />
    case 'openai':
    case 'custom_openai':
      return <MessageSquare className={className} />
    case 'ollama': return <Server className={className} />
    case 'azure': return <Cloud className={className} />
    case 'vertex': return <Database className={className} />
    default: return <Cpu className={className} />
  }
}

export function SettingsPage() {
  const [providers, setProviders] = useState<LLMProvider[]>([])
  const [activeLLM, setActiveLLMState] = useState<ActiveLLM>({ provider_id: 'none', model_id: '' })
  const [isLoading, setIsLoading] = useState(true)

  // GPU state
  const [gpuEnabled, setGpuEnabled] = useState(false)
  const [gpuStatus, setGpuStatus] = useState<GPUStatus | null>(null)
  const [isPollingGpu, setIsPollingGpu] = useState(false)

  // Drawer & Modal state
  const [activeDrawer, setActiveDrawer] = useState<{
    type: 'keys' | 'models'
    providerId: string
  } | null>(null)
  const [showAddCustomModal, setShowAddCustomModal] = useState(false)

  // Add Custom Provider Form state
  const [customName, setCustomName] = useState('')
  const [customBaseUrl, setCustomBaseUrl] = useState('')
  const [customType, setCustomType] = useState('custom_openai')

  // Connection testing state (drawer specific)
  const [isTesting, setIsTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)

  // Model management state (drawer specific)
  const [isFetchingModels, setIsFetchingModels] = useState(false)
  const [fetchedModels, setFetchedModels] = useState<string[]>([])
  const [modelSearchQuery, setModelSearchQuery] = useState('')
  const [customModelId, setCustomModelId] = useState('')
  const [expandedModelSettings, setExpandedModelSettings] = useState<string | null>(null)

  // Fetch initial data
  useEffect(() => {
    async function loadInitialData() {
      try {
        const provs = await getLLMProviders()
        const active = await getActiveLLM()
        setProviders(provs)
        setActiveLLMState(active)

        const settingsList = await getSettings()
        const gpuSetting = settingsList.find((s) => s.key === 'gpu_acceleration_enabled')
        setGpuEnabled(gpuSetting?.value === 'true')

        const status = await getGPUStatus()
        setGpuStatus(status)
        if (status.status === 'installing') {
          setIsPollingGpu(true)
        }
      } catch (err) {
        console.error('Failed to load settings data', err)
        toast.error('Failed to load settings configuration')
      } finally {
        setIsLoading(false)
      }
    }
    loadInitialData()
  }, [])

  // GPU polling
  useEffect(() => {
    let timer: number
    if (isPollingGpu) {
      timer = window.setInterval(async () => {
        try {
          const status = await getGPUStatus()
          setGpuStatus(status)
          if (status.status !== 'installing') {
            setIsPollingGpu(false)
            if (status.status === 'ready') {
              toast.success('GPU Acceleration is ready!')
            } else if (status.status === 'failed') {
              toast.error('GPU Acceleration installation failed.')
            }
          }
        } catch (err) {
          console.error('Error polling GPU status', err)
        }
      }, 2000)
    }
    return () => clearInterval(timer)
  }, [isPollingGpu])

  const handleToggleGpu = async (checked: boolean) => {
    setGpuEnabled(checked)
    try {
      await toggleGPU(checked)
      toast.success(`GPU Acceleration ${checked ? 'enabled' : 'disabled'}`)
      if (checked && (!gpuStatus || gpuStatus.status === 'not_installed' || gpuStatus.status === 'failed')) {
        await installGPU()
        setIsPollingGpu(true)
        toast.info('Installation started...')
      }
    } catch (err) {
      toast.error('Failed to toggle GPU acceleration')
      setGpuEnabled(!checked)
    }
  }

  // Get currently selected provider for drawers
  const currentProvider = providers.find((p) => p.id === activeDrawer?.providerId)

  // Save full providers configuration
  const handleSaveProviders = async (updatedProviders: LLMProvider[]) => {
    try {
      const saved = await saveLLMProviders(updatedProviders)
      setProviders(saved)
      toast.success('Configuration saved successfully')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save configuration'
      toast.error(msg)
    }
  }

  // Handle active LLM selection change
  const handleActiveChange = async (providerId: string, modelId: string) => {
    const active = { provider_id: providerId, model_id: modelId }
    try {
      await setActiveLLM(active)
      setActiveLLMState(active)
      toast.success('Global active LLM updated')
    } catch (err) {
      toast.error('Failed to update active LLM')
    }
  }

  // Create custom OpenAI provider
  const handleAddCustomProvider = () => {
    if (!customName.trim()) {
      toast.error('Provider name is required')
      return
    }
    const cleanUrl = customBaseUrl.trim()
    if (!cleanUrl) {
      toast.error('Base URL is required')
      return
    }

    const providerId = 'custom-' + customName.toLowerCase().replace(/[^a-z0-9]/g, '-')
    if (providers.some((p) => p.id === providerId)) {
      toast.error('A provider with this name already exists')
      return
    }

    const newProvider: LLMProvider = {
      id: providerId,
      type: customType,
      label: customName.trim(),
      api_key: '',
      fallback_api_keys: [],
      base_url: cleanUrl,
      models: [],
    }

    const updated = [...providers, newProvider]
    setProviders(updated)
    void handleSaveProviders(updated)

    setCustomName('')
    setCustomBaseUrl('')
    setCustomType('custom_openai')
    setShowAddCustomModal(false)
    toast.success(`Custom provider "${newProvider.label}" added`)
  }

  // Delete custom provider
  const handleDeleteProvider = (providerId: string) => {
    const updated = providers.filter((p) => p.id !== providerId)
    setProviders(updated)
    void handleSaveProviders(updated)

    if (activeLLM.provider_id === providerId) {
      void handleActiveChange('none', '')
    }
    toast.success('Provider deleted')
  }

  // Test Connection helper inside credentials drawer
  const handleTestConnection = async () => {
    if (!currentProvider) return
    setIsTesting(true)
    setTestResult(null)
    toast.info('Testing connection to provider...')
    
    try {
      // Map to legacy structure for the backend connection tester
      const backendConfig: any = {
        llm_service: 
          currentProvider.type === 'custom_openai' ? 'openai' : 
          currentProvider.type === 'custom_anthropic' ? 'claude' : 
          currentProvider.type,
        timeout: 15,
        max_retries: 2,
        max_output_tokens: 4096,
      }

      const apiKey = currentProvider.api_key
      const baseUrl = currentProvider.base_url
      const model = currentProvider.models[0]?.model_id || 'test'

      if (currentProvider.type === 'gemini' || currentProvider.type === 'vertex') {
        backendConfig.gemini_api_key = apiKey
        backendConfig.gemini_model_name = model
        if (currentProvider.type === 'vertex') {
          backendConfig.vertex_project_id = apiKey
          backendConfig.vertex_location = baseUrl
        }
      } else if (currentProvider.type === 'claude' || currentProvider.type === 'custom_anthropic') {
        backendConfig.claude_api_key = apiKey
        backendConfig.claude_model_name = model
        if (currentProvider.type === 'custom_anthropic') {
          backendConfig.openai_base_url = baseUrl
        }
      } else if (currentProvider.type === 'ollama') {
        backendConfig.ollama_base_url = baseUrl
        backendConfig.ollama_model = model
      } else if (currentProvider.type === 'azure') {
        backendConfig.azure_api_key = apiKey
        backendConfig.azure_endpoint = baseUrl
        backendConfig.azure_deployment_name = model
      } else {
        // OpenAI / Custom OpenAI
        backendConfig.openai_api_key = apiKey
        backendConfig.openai_base_url = baseUrl
        backendConfig.openai_model = model
      }

      // We call connection tester
      const res = await fetch('/api/settings/llm/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(backendConfig),
      })
      const data = await res.json()
      if (res.ok && data.success) {
        setTestResult({ success: true, message: data.message || 'Connected successfully!' })
        toast.success('Connection test passed!')
      } else {
        setTestResult({ success: false, message: data.detail || data.message || 'Connection failed.' })
        toast.error('Connection test failed.')
      }
    } catch (err) {
      setTestResult({ success: false, message: err instanceof Error ? err.message : 'Network error.' })
      toast.error('Connection test failed.')
    } finally {
      setIsTesting(false)
    }
  }

  // Fetch models from API inside drawer
  const handleFetchModels = async () => {
    if (!currentProvider) return
    setIsFetchingModels(true)
    setFetchedModels([])
    toast.info('Querying provider model list...')

    try {
      const list = await fetchAvailableModels(
        currentProvider.id,
        currentProvider.type,
        currentProvider.base_url,
        currentProvider.api_key
      )
      setFetchedModels(list)
      if (list.length === 0) {
        toast.info('No models returned by provider')
      } else {
        toast.success(`Successfully fetched ${list.length} models`)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to query models'
      toast.error(msg)
    } finally {
      setIsFetchingModels(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-32 space-y-4">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
        <p className="text-sm text-muted-foreground animate-pulse">Loading settings...</p>
      </div>
    )
  }

  return (
    <div className="max-w-[1400px] mx-auto space-y-8 pb-12 px-4 md:px-6 relative">
      {/* Header */}
      <div className="border-b border-border/20 pb-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight text-foreground">Settings</h2>
          <p className="text-xs md:text-sm text-muted-foreground mt-1.5 leading-relaxed">
            Configure language model backends, API credentials, and parameter thresholds.
          </p>
        </div>
        <Button
          onClick={() => setShowAddCustomModal(true)}
          className="shadow-sm rounded-lg hover:scale-[1.005] active:scale-[0.99] transition-all text-xs font-bold uppercase tracking-wider h-10 w-fit shrink-0 gap-1.5"
        >
          <ListPlus className="w-4 h-4" />
          Add Custom OpenAI Provider
        </Button>
      </div>

      {/* Global LLM active banner */}
      <div className="glass-card border border-border/30 rounded-2xl p-5 shadow-sm space-y-4 bg-card/15">
        <div className="flex items-center gap-2 border-b border-border/20 pb-3">
          <Activity className="w-4.5 h-4.5 text-primary" />
          <h3 className="font-extrabold text-sm text-foreground uppercase tracking-wider">Global LLM Configuration</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-end">
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold tracking-widest text-muted-foreground/80 uppercase">Active Provider</label>
            <Select
              value={activeLLM.provider_id}
              onChange={(val) => {
                const pObj = providers.find((p) => p.id === val)
                const firstModel = pObj?.models[0]?.model_id || ''
                void handleActiveChange(val, firstModel)
              }}
              options={[
                { value: 'none', label: 'None (Disable LLMs)' },
                ...providers.map((p) => ({
                  value: p.id,
                  label: `${p.label} (${p.type.replace('_', ' ')})`
                }))
              ]}
              className="w-full md:w-full"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold tracking-widest text-muted-foreground/80 uppercase">Active Model</label>
            <Select
              value={activeLLM.model_id}
              onChange={(val) => void handleActiveChange(activeLLM.provider_id, val)}
              disabled={activeLLM.provider_id === 'none'}
              options={[
                ...(activeLLM.model_id ? [] : [{ value: '', label: 'Select model...' }]),
                ...(providers
                  .find((p) => p.id === activeLLM.provider_id)
                  ?.models.map((m) => ({
                    value: m.model_id,
                    label: m.model_id
                  })) || [])
              ]}
              className="w-full md:w-full"
            />
          </div>
        </div>
      </div>

      {/* Provider List Cards Grid */}
      <div className="space-y-4">
        <h3 className="text-xs font-bold tracking-widest text-muted-foreground/80 uppercase pb-2 border-b border-border/20 flex items-center gap-2">
          <Sliders className="w-4 h-4 text-primary" />
          Configured Service Providers
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {providers.map((p) => {
            const isActive = activeLLM.provider_id === p.id
            const isConfigured = !!p.api_key || p.type === 'ollama'
            return (
              <div
                key={p.id}
                className={cn(
                  'border rounded-xl p-5 flex flex-col justify-between transition-all bg-card/25 shadow-sm',
                  isActive ? 'border-primary shadow-sm bg-primary/[0.01]' : 'border-border/60'
                )}
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-muted border border-border/40 text-muted-foreground">
                        <ProviderIcon type={p.type} className="w-4.5 h-4.5" />
                      </div>
                      <div>
                        <div className="font-extrabold text-sm text-foreground flex items-center gap-1.5 leading-none">
                          {p.label}
                        </div>
                        <span className="text-[10px] text-muted-foreground/85 block mt-0.5 capitalize">{p.type.replace('_', ' ')}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {isActive && (
                        <Badge variant="success" className="text-[9px] uppercase font-bold tracking-wider px-2 py-0.5">
                          Active
                        </Badge>
                      )}
                      {isConfigured ? (
                        <Badge variant="outline" className="text-[9px] uppercase font-bold tracking-wider px-2 py-0.5 border-emerald-500/30 text-emerald-500 bg-emerald-500/5">
                          Configured
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[9px] uppercase font-bold tracking-wider px-2 py-0.5 opacity-60">
                          Inactive
                        </Badge>
                      )}
                    </div>
                  </div>

                  <div className="text-[11px] text-muted-foreground/90 space-y-1 bg-black/15 p-2.5 rounded-lg border border-border/10 font-medium">
                    <div className="flex justify-between">
                      <span>Models:</span>
                      <span className="font-bold text-foreground">{p.models.length}</span>
                    </div>
                    {p.base_url && (
                      <div className="truncate text-left">
                        <span className="opacity-60 block text-[9px] uppercase tracking-wider font-bold">Endpoint</span>
                        <span className="font-mono font-semibold">{p.base_url}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 mt-4 pt-3 border-t border-border/10">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setTestResult(null)
                      setActiveDrawer({ type: 'keys', providerId: p.id })
                    }}
                    className="flex-1 text-[10px] font-bold uppercase tracking-wider h-8 rounded-lg border-border/50 hover:bg-muted/40"
                  >
                    <Key className="w-3.5 h-3.5 mr-1 text-muted-foreground" />
                    Credentials
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setFetchedModels([])
                      setModelSearchQuery('')
                      setCustomModelId('')
                      setExpandedModelSettings(null)
                      setActiveDrawer({ type: 'models', providerId: p.id })
                    }}
                    className="flex-1 text-[10px] font-bold uppercase tracking-wider h-8 rounded-lg border-border/50 hover:bg-muted/40"
                  >
                    <Settings className="w-3.5 h-3.5 mr-1 text-muted-foreground" />
                    Models ({p.models.length})
                  </Button>
                  {(p.type === 'custom_openai' || p.type === 'custom_anthropic') && (
                    <Button
                      variant="ghost"
                      onClick={() => handleDeleteProvider(p.id)}
                      className="w-8 h-8 p-0 rounded-lg hover:bg-rose-500/10 text-muted-foreground hover:text-rose-500 transition-colors"
                      title="Delete provider"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* GPU Acceleration Section */}
      <div className="space-y-4 pt-6 border-t border-border/20">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h3 className="text-xs font-bold tracking-widest text-muted-foreground/80 uppercase flex items-center gap-2">
              <Cpu className="w-4 h-4 text-primary" />
              GPU Acceleration
            </h3>
            <p className="text-xs text-muted-foreground leading-relaxed max-w-3xl">
              Accelerate layout detection, OCR, and table extraction using your system's NVIDIA GPU (via CUDA).
            </p>
          </div>
          {/* Toggle Switch */}
          <div className="flex items-center gap-3">
            {gpuStatus?.status === 'ready' && (
              <Badge variant="success" className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider">
                Ready
              </Badge>
            )}
            {gpuStatus?.status === 'installing' && (
              <Badge variant="processing" className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider">
                Installing {gpuStatus.progress}%
              </Badge>
            )}
            {gpuStatus?.status === 'failed' && (
              <Badge variant="destructive" className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider">
                Verification Failed
              </Badge>
            )}
            <button
              type="button"
              onClick={() => handleToggleGpu(!gpuEnabled)}
              disabled={isPollingGpu}
              className={cn(
                'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
                gpuEnabled ? 'bg-primary' : 'bg-muted border-border/20',
                isPollingGpu && 'opacity-50 cursor-not-allowed'
              )}
            >
              <span
                className={cn(
                  'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out',
                  gpuEnabled ? 'translate-x-5' : 'translate-x-0'
                )}
              />
            </button>
          </div>
        </div>

        {/* Installation Progress & Logs */}
        {gpuEnabled && gpuStatus && gpuStatus.status !== 'not_installed' && (
          <div className="space-y-3 p-4 rounded-xl border border-border/50 bg-card/45 animate-fade-in">
            {/* Progress bar */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-foreground">
                  {gpuStatus.status === 'installing' && 'Downloading & Installing Backend Components...'}
                  {gpuStatus.status === 'ready' && 'GPU Acceleration is active and verified.'}
                  {gpuStatus.status === 'failed' && 'Installation failed.'}
                </span>
                <span className="font-semibold text-muted-foreground">{gpuStatus.progress}%</span>
              </div>
              <div className="w-full bg-muted/30 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-primary h-full transition-all duration-300"
                  style={{ width: `${gpuStatus.progress}%` }}
                />
              </div>
            </div>

            {/* Error message */}
            {gpuStatus.status === 'failed' && gpuStatus.error_message && (
              <div className="text-xs text-destructive bg-destructive/10 p-3 rounded-lg border border-destructive/20 leading-relaxed">
                <strong className="font-semibold">Error:</strong> {gpuStatus.error_message}
                <button
                  onClick={() => handleToggleGpu(true)}
                  className="ml-3 underline text-primary hover:text-primary/80 font-semibold uppercase tracking-wider text-[10px]"
                >
                  Retry Installation
                </button>
              </div>
            )}

            {/* Log messages */}
            {gpuStatus.logs && gpuStatus.logs.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-[10px] font-bold tracking-widest text-muted-foreground/80 uppercase">Installation Logs</div>
                <div className="h-40 overflow-y-auto p-3 bg-black/60 rounded-lg text-[11px] font-mono text-emerald-400 border border-border/10 space-y-1 select-text scrollbar-thin font-semibold text-left">
                  {gpuStatus.logs.map((log, i) => (
                    <div key={i} className="whitespace-pre-wrap leading-relaxed">{log}</div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Slide-over Drawer for API Keys & Credentials */}
      {activeDrawer && activeDrawer.type === 'keys' && currentProvider && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm transition-opacity duration-300">
          {/* Backdrop Dismiss Click */}
          <div className="absolute inset-0" onClick={() => setActiveDrawer(null)} />

          {/* Panel */}
          <div className="relative w-full max-w-md bg-background border-l border-border/60 shadow-2xl h-full flex flex-col text-left z-10 animate-slide-in">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-border/20">
              <div className="flex items-center gap-2.5">
                <Key className="w-5 h-5 text-primary" />
                <div>
                  <h3 className="font-extrabold text-sm text-foreground uppercase tracking-wider">
                    {currentProvider.label} Credentials
                  </h3>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Manage API endpoints, keys, and fallbacks.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveDrawer(null)}
                className="p-1 rounded-md text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              {/* Base URL (if applicable) */}
              {currentProvider.type !== 'gemini' && currentProvider.type !== 'claude' && (
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold tracking-widest text-muted-foreground/80 uppercase flex items-center gap-1.5">
                    <Globe className="w-3.5 h-3.5 text-muted-foreground" />
                    {currentProvider.type === 'azure' ? 'Azure Endpoint URL' : 'API Base URL'}
                  </label>
                  <Input
                    value={currentProvider.base_url || ''}
                    onChange={(e) => {
                      const updated = providers.map((p) =>
                        p.id === currentProvider.id ? { ...p, base_url: e.target.value } : p
                      )
                      setProviders(updated)
                    }}
                    placeholder={
                      currentProvider.type === 'azure'
                        ? 'https://your-resource.openai.azure.com'
                        : currentProvider.type === 'ollama'
                        ? 'http://localhost:11434'
                        : 'https://api.example.com/v1'
                    }
                    className="bg-background/50 text-xs"
                  />
                </div>
              )}

              {/* Primary API Key */}
              {currentProvider.type !== 'ollama' && (
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold tracking-widest text-muted-foreground/80 uppercase flex items-center gap-1.5">
                    <Key className="w-3.5 h-3.5 text-muted-foreground" />
                    {currentProvider.type === 'vertex' ? 'Google Cloud Project ID' : 'Primary API Key'}
                  </label>
                  <Input
                    type="password"
                    value={currentProvider.api_key || ''}
                    onChange={(e) => {
                      const updated = providers.map((p) =>
                        p.id === currentProvider.id ? { ...p, api_key: e.target.value } : p
                      )
                      setProviders(updated)
                    }}
                    placeholder={
                      currentProvider.type === 'vertex'
                        ? 'e.g., my-gcp-project-123'
                        : 'Enter credentials token'
                    }
                    className="bg-background/50 text-xs"
                  />
                </div>
              )}

              {/* Fallback API Keys (up to 5) */}
              {currentProvider.type !== 'ollama' && currentProvider.type !== 'vertex' && (
                <div className="space-y-3 pt-2 border-t border-border/10">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-bold tracking-widest text-muted-foreground/80 uppercase flex items-center gap-1.5">
                      <ListPlus className="w-3.5 h-3.5 text-muted-foreground" />
                      Fallback API Keys ({currentProvider.fallback_api_keys.length}/5)
                    </label>
                    {currentProvider.fallback_api_keys.length < 5 && (
                      <button
                        type="button"
                        onClick={() => {
                          const updated = providers.map((p) =>
                            p.id === currentProvider.id
                              ? { ...p, fallback_api_keys: [...p.fallback_api_keys, ''] }
                              : p
                          )
                          setProviders(updated)
                        }}
                        className="text-[10px] font-bold text-primary hover:underline uppercase flex items-center gap-1"
                      >
                        <Plus className="w-3 h-3" /> Add
                      </button>
                    )}
                  </div>

                  <div className="space-y-2">
                    {currentProvider.fallback_api_keys.map((keyVal, idx) => (
                      <div key={idx} className="flex gap-2 items-center">
                        <span className="text-[10px] font-bold font-mono text-muted-foreground shrink-0 w-4">#{idx + 1}</span>
                        <Input
                          type="password"
                          value={keyVal}
                          onChange={(e) => {
                            const newFallbacks = [...currentProvider.fallback_api_keys]
                            newFallbacks[idx] = e.target.value
                            const updated = providers.map((p) =>
                              p.id === currentProvider.id ? { ...p, fallback_api_keys: newFallbacks } : p
                            )
                            setProviders(updated)
                          }}
                          placeholder={`Fallback key ${idx + 1}`}
                          className="bg-background/50 text-xs flex-1"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const newFallbacks = currentProvider.fallback_api_keys.filter((_, i) => i !== idx)
                            const updated = providers.map((p) =>
                              p.id === currentProvider.id ? { ...p, fallback_api_keys: newFallbacks } : p
                            )
                            setProviders(updated)
                          }}
                          className="p-2 text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                    {currentProvider.fallback_api_keys.length === 0 && (
                      <div className="text-[11px] text-muted-foreground/60 italic py-2 text-center">
                        No fallback API keys configured.
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Test connection result */}
              {testResult && (
                <div
                  className={cn(
                    'p-4 rounded-xl border flex items-start gap-3 mt-4 text-left',
                    testResult.success
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-800 dark:text-emerald-300'
                      : 'bg-destructive/10 border-destructive/30 text-destructive'
                  )}
                >
                  {testResult.success ? (
                    <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-500 mt-0.5" />
                  ) : (
                    <AlertTriangle className="w-5 h-5 shrink-0 text-destructive mt-0.5" />
                  )}
                  <div>
                    <div className="font-bold text-xs">{testResult.success ? 'Connection Successful' : 'Connection Failed'}</div>
                    <div className="text-[10px] mt-1 leading-normal opacity-90 font-mono whitespace-pre-wrap">{testResult.message}</div>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-6 py-4 border-t border-border/20 bg-muted/10">
              <Button
                variant="outline"
                onClick={handleTestConnection}
                disabled={isTesting || currentProvider.type === 'vertex'}
                className="text-xs font-bold uppercase tracking-wider px-4 rounded-lg h-10 border-border/60 hover:bg-muted/50 gap-1.5"
              >
                {isTesting ? (
                  <Loader2 className="w-4 h-4 animate-spin text-primary" />
                ) : (
                  <TestTube className="w-4 h-4 text-muted-foreground" />
                )}
                Test Connection
              </Button>

              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  onClick={() => setActiveDrawer(null)}
                  className="text-xs font-bold uppercase tracking-wider px-4 rounded-lg h-10"
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => {
                    void handleSaveProviders(providers)
                    setActiveDrawer(null)
                  }}
                  className="text-xs font-bold uppercase tracking-wider px-5 rounded-lg shadow-sm h-10 gap-1.5"
                >
                  <Save className="w-4 h-4" />
                  Save Settings
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Slide-over Drawer for Model Management */}
      {activeDrawer && activeDrawer.type === 'models' && currentProvider && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm transition-opacity duration-300">
          <div className="absolute inset-0" onClick={() => setActiveDrawer(null)} />

          <div className="relative w-full max-w-md bg-background border-l border-border/60 shadow-2xl h-full flex flex-col text-left z-10 animate-slide-in">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-border/20">
              <div className="flex items-center gap-2.5">
                <Settings className="w-5 h-5 text-primary" />
                <div>
                  <h3 className="font-extrabold text-sm text-foreground uppercase tracking-wider">
                    {currentProvider.label} Models
                  </h3>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Add, query, and edit model threshold parameters.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveDrawer(null)}
                className="p-1 rounded-md text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Fetch models action */}
              {currentProvider.type !== 'vertex' && (
                <div className="bg-card/40 border border-border/40 p-4 rounded-xl space-y-3.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-extrabold tracking-widest text-muted-foreground uppercase">Query API Models List</span>
                    <Button
                      size="sm"
                      onClick={handleFetchModels}
                      disabled={isFetchingModels}
                      className="h-8 text-[9px] font-bold uppercase tracking-wider rounded-lg px-3 gap-1.5"
                    >
                      {isFetchingModels && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      Fetch Models
                    </Button>
                  </div>

                  {fetchedModels.length > 0 && (
                    <div className="space-y-2 animate-fade-in">
                      <Input
                        value={modelSearchQuery}
                        onChange={(e) => setModelSearchQuery(e.target.value)}
                        placeholder="Search returned models..."
                        className="bg-background text-xs"
                      />
                      <div className="max-h-40 overflow-y-auto border border-border/20 bg-background/50 rounded-lg divide-y divide-border/10 scrollbar-thin">
                        {fetchedModels
                          .filter((m) => m.toLowerCase().includes(modelSearchQuery.toLowerCase()))
                          .map((modelId) => {
                            const alreadyAdded = currentProvider.models.some((m) => m.model_id === modelId)
                            return (
                              <div key={modelId} className="flex items-center justify-between p-2 text-xs">
                                <span className="font-mono font-semibold truncate max-w-[75%]" title={modelId}>
                                  {modelId}
                                </span>
                                {alreadyAdded ? (
                                  <Badge variant="secondary" className="text-[9px] uppercase font-bold tracking-wider opacity-60">Added</Badge>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const newModel: ModelConfig = { model_id: modelId }
                                      const updated = providers.map((p) =>
                                        p.id === currentProvider.id
                                          ? { ...p, models: [...p.models, newModel] }
                                          : p
                                      )
                                      setProviders(updated)
                                      toast.success(`Model "${modelId}" added`)
                                    }}
                                    className="text-[10px] font-bold text-primary hover:underline uppercase"
                                  >
                                    Add
                                  </button>
                                )}
                              </div>
                            )
                          })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Add Custom Model ID */}
              <div className="space-y-2">
                <label className="text-[10px] font-bold tracking-widest text-muted-foreground/80 uppercase block">Add Custom Model ID</label>
                <div className="flex gap-2">
                  <Input
                    value={customModelId}
                    onChange={(e) => setCustomModelId(e.target.value)}
                    placeholder="e.g. gpt-4o-2024-05-13"
                    className="bg-background/50 text-xs flex-1"
                  />
                  <Button
                    type="button"
                    onClick={() => {
                      const cleanId = customModelId.trim()
                      if (!cleanId) return
                      if (currentProvider.models.some((m) => m.model_id === cleanId)) {
                        toast.error('Model ID already exists')
                        return
                      }
                      const newModel: ModelConfig = { model_id: cleanId }
                      const updated = providers.map((p) =>
                        p.id === currentProvider.id ? { ...p, models: [...p.models, newModel] } : p
                      )
                      setProviders(updated)
                      setCustomModelId('')
                      toast.success(`Model "${cleanId}" added`)
                    }}
                    className="text-[10px] font-bold uppercase tracking-wider h-9.5 rounded-lg px-4 gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add
                  </Button>
                </div>
              </div>

              {/* Configured Models List */}
              <div className="space-y-3 pt-4 border-t border-border/15">
                <label className="text-[10px] font-bold tracking-widest text-muted-foreground/80 uppercase block">
                  Configured Models ({currentProvider.models.length})
                </label>

                <div className="space-y-2">
                  {currentProvider.models.map((model, mIdx) => {
                    const isExpanded = expandedModelSettings === model.model_id
                    return (
                      <div
                        key={model.model_id}
                        className="border border-border/40 rounded-xl overflow-hidden bg-card/15 shadow-sm"
                      >
                        {/* Header bar */}
                        <div className="flex items-center justify-between p-3.5 bg-muted/20 select-none">
                          <button
                            type="button"
                            onClick={() => setExpandedModelSettings(isExpanded ? null : model.model_id)}
                            className="flex items-center gap-2 truncate text-left flex-1"
                          >
                            <span className="font-semibold text-xs font-mono truncate text-foreground flex-1">
                              {model.model_id}
                            </span>
                            {isExpanded ? (
                              <ChevronUp className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                            ) : (
                              <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              const updatedModels = currentProvider.models.filter((_, i) => i !== mIdx)
                              const updated = providers.map((p) =>
                                p.id === currentProvider.id ? { ...p, models: updatedModels } : p
                              )
                              setProviders(updated)
                              toast.info(`Model "${model.model_id}" removed`)
                              if (isExpanded) setExpandedModelSettings(null)
                            }}
                            className="p-1.5 ml-2 text-muted-foreground hover:text-rose-500 rounded-lg hover:bg-rose-500/10 transition-colors"
                          >
                            <Trash className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* Expandable settings panel */}
                        {isExpanded && (
                          <div className="p-4 border-t border-border/10 bg-background/30 space-y-4 text-xs animate-fade-in text-left">
                            <h4 className="text-[9px] font-bold tracking-wider text-muted-foreground uppercase pb-1 border-b border-border/10">
                              Threshold Parameters Override
                            </h4>

                            <div className="grid grid-cols-2 gap-3.5">
                              {/* Timeout */}
                              <div className="space-y-1">
                                <label className="text-[9px] font-semibold text-muted-foreground uppercase">Timeout (s)</label>
                                <Input
                                  type="number"
                                  value={model.timeout ?? ''}
                                  onChange={(e) => {
                                    const val = e.target.value ? Number(e.target.value) : undefined
                                    const updatedModels = [...currentProvider.models]
                                    updatedModels[mIdx] = { ...model, timeout: val }
                                    const updated = providers.map((p) =>
                                      p.id === currentProvider.id ? { ...p, models: updatedModels } : p
                                    )
                                    setProviders(updated)
                                  }}
                                  placeholder="Default (60s)"
                                  className="text-xs bg-background/50"
                                />
                              </div>

                              {/* Max Retries */}
                              <div className="space-y-1">
                                <label className="text-[9px] font-semibold text-muted-foreground uppercase">Max Retries</label>
                                <Input
                                  type="number"
                                  value={model.max_retries ?? ''}
                                  onChange={(e) => {
                                    const val = e.target.value ? Number(e.target.value) : undefined
                                    const updatedModels = [...currentProvider.models]
                                    updatedModels[mIdx] = { ...model, max_retries: val }
                                    const updated = providers.map((p) =>
                                      p.id === currentProvider.id ? { ...p, models: updatedModels } : p
                                    )
                                    setProviders(updated)
                                  }}
                                  placeholder="Default (3)"
                                  className="text-xs bg-background/50"
                                />
                              </div>

                              {/* Max Output Tokens */}
                              <div className="space-y-1">
                                <label className="text-[9px] font-semibold text-muted-foreground uppercase">Max Output Tokens</label>
                                <Input
                                  type="number"
                                  value={model.max_output_tokens ?? ''}
                                  onChange={(e) => {
                                    const val = e.target.value ? Number(e.target.value) : undefined
                                    const updatedModels = [...currentProvider.models]
                                    updatedModels[mIdx] = { ...model, max_output_tokens: val }
                                    const updated = providers.map((p) =>
                                      p.id === currentProvider.id ? { ...p, models: updatedModels } : p
                                    )
                                    setProviders(updated)
                                  }}
                                  placeholder="Default (4096)"
                                  className="text-xs bg-background/50"
                                />
                              </div>

                              {/* Context Window */}
                              <div className="space-y-1">
                                <label className="text-[9px] font-semibold text-muted-foreground uppercase">Context Window</label>
                                <Input
                                  type="number"
                                  value={model.context_window ?? ''}
                                  onChange={(e) => {
                                    const val = e.target.value ? Number(e.target.value) : undefined
                                    const updatedModels = [...currentProvider.models]
                                    updatedModels[mIdx] = { ...model, context_window: val }
                                    const updated = providers.map((p) =>
                                      p.id === currentProvider.id ? { ...p, models: updatedModels } : p
                                    )
                                    setProviders(updated)
                                  }}
                                  placeholder="Intelligent auto"
                                  className="text-xs bg-background/50"
                                />
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                  {currentProvider.models.length === 0 && (
                    <div className="text-xs text-muted-foreground/50 italic py-6 text-center border border-dashed border-border/30 rounded-xl bg-card/5">
                      No models configured. Add one above.
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-border/20 bg-muted/10">
              <Button
                variant="ghost"
                onClick={() => setActiveDrawer(null)}
                className="text-xs font-bold uppercase tracking-wider px-4 rounded-lg h-10"
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  void handleSaveProviders(providers)
                  setActiveDrawer(null)
                }}
                className="text-xs font-bold uppercase tracking-wider px-5 rounded-lg shadow-sm h-10 gap-1.5"
              >
                <Save className="w-4 h-4" />
                Save Models
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Add Custom Provider Modal Popup */}
      {showAddCustomModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm transition-opacity duration-300">
          <div className="absolute inset-0" onClick={() => setShowAddCustomModal(false)} />

          <div className="relative glass-card max-w-md w-full bg-background border border-border/50 rounded-2xl shadow-xl overflow-hidden animate-modal-zoom-in text-left z-10 flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border/20">
              <div className="flex items-center gap-2">
                <ListPlus className="w-4.5 h-4.5 text-primary" />
                <h3 className="font-extrabold text-sm text-foreground uppercase tracking-wider">Add Custom Provider</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowAddCustomModal(false)}
                className="p-1 rounded-md text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold tracking-widest text-muted-foreground/80 uppercase">Provider Name</label>
                <Input
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder="e.g. DeepSeek"
                  className="bg-background/50 text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold tracking-widest text-muted-foreground/80 uppercase">API Protocol</label>
                <Select
                  value={customType}
                  onChange={(val) => setCustomType(val)}
                  options={[
                    { value: 'custom_openai', label: 'OpenAI Compatible (Chat Completions)' },
                    { value: 'custom_anthropic', label: 'Anthropic Compatible (Messages)' }
                  ]}
                  className="w-full md:w-full"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold tracking-widest text-muted-foreground/80 uppercase">Base Endpoint URL</label>
                <Input
                  value={customBaseUrl}
                  onChange={(e) => setCustomBaseUrl(e.target.value)}
                  placeholder="e.g. https://api.deepseek.com/v1"
                  className="bg-background/50 text-xs"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-border/20 bg-muted/10">
              <Button
                variant="ghost"
                onClick={() => setShowAddCustomModal(false)}
                className="text-xs font-bold uppercase tracking-wider px-4 rounded-lg h-10"
              >
                Cancel
              </Button>
              <Button
                onClick={handleAddCustomProvider}
                className="text-xs font-bold uppercase tracking-wider px-5 rounded-lg shadow-sm h-10 gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Provider
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
