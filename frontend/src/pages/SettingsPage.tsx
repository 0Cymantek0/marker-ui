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
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { useLLMConfig } from '@/hooks/useSettings'
import { useMutation } from '@/hooks/useSettings'
import {
  updateLLMConfig,
  testLLMConnection,
  getSettings,
  getGPUStatus,
  installGPU,
  toggleGPU,
  type LLMConfig,
  type LLMService,
  type GPUStatus
} from '@/lib/api'
import { cn } from '@/lib/utils'


const LLM_SERVICES: { value: LLMService; label: string; desc: string; icon: string }[] = [
  { value: 'none', label: 'None', desc: 'No LLM integrations', icon: 'Cpu' },
  { value: 'gemini', label: 'Gemini', desc: 'Google Gemini Pro/Flash', icon: 'Sparkles' },
  { value: 'claude', label: 'Claude', desc: 'Anthropic Claude Sonnet', icon: 'Brain' },
  { value: 'openai', label: 'OpenAI Compatible', desc: 'OpenAI API or any compatible endpoint', icon: 'MessageSquare' },
  { value: 'ollama', label: 'Ollama', desc: 'Local models (Ollama)', icon: 'Server' },
  { value: 'azure', label: 'Azure OpenAI', desc: 'Microsoft Azure OpenAI', icon: 'Cloud' },
  { value: 'vertex', label: 'Vertex AI', desc: 'Google Cloud Vertex AI', icon: 'Database' },
]

const SERVICE_FIELDS: Record<string, { apiKey?: boolean; baseUrl?: boolean; model?: boolean }> = {
  none: {},
  gemini: { apiKey: true, model: true },
  vertex: { apiKey: true, model: true }, // Vertex uses api_key field for project_id
  ollama: { baseUrl: true, model: true },
  claude: { apiKey: true, model: true },
  openai: { apiKey: true, baseUrl: true, model: true },
  azure: { apiKey: true, baseUrl: true, model: true }, // Azure maps endpoint to base_url, deployment to model
}

const DEFAULT_LLM: LLMConfig = {
  service: 'none',
  api_key: '',
  base_url: '',
  model_name: '',
  timeout: 30,
  max_retries: 3,
  max_output_tokens: 8192,
}

function ServiceIcon({ name, className }: { name: string; className?: string }) {
  switch (name) {
    case 'Cpu': return <Cpu className={className} />
    case 'Sparkles': return <Sparkles className={className} />
    case 'Brain': return <Brain className={className} />
    case 'MessageSquare': return <MessageSquare className={className} />
    case 'Server': return <Server className={className} />
    case 'Cloud': return <Cloud className={className} />
    case 'Database': return <Database className={className} />
    default: return <Cpu className={className} />
  }
}

export function SettingsPage() {
  const { config, isLoading, refetch } = useLLMConfig()
  const [form, setForm] = useState<LLMConfig>(DEFAULT_LLM)
  const [isTesting, setIsTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)
  
  const save = useMutation(updateLLMConfig)

  useEffect(() => {
    if (config) setForm(config)
  }, [config])

  const [gpuEnabled, setGpuEnabled] = useState(false)
  const [gpuStatus, setGpuStatus] = useState<GPUStatus | null>(null)
  const [isPollingGpu, setIsPollingGpu] = useState(false)

  useEffect(() => {
    async function loadGpuSetting() {
      try {
        const settingsList = await getSettings()
        const gpuSetting = settingsList.find(s => s.key === 'gpu_acceleration_enabled')
        setGpuEnabled(gpuSetting?.value === 'true')
      } catch (err) {
        console.error('Failed to load GPU setting', err)
      }
    }
    loadGpuSetting()
  }, [])

  useEffect(() => {
    async function fetchStatus() {
      try {
        const status = await getGPUStatus()
        setGpuStatus(status)
        if (status.status === 'installing') {
          setIsPollingGpu(true)
        }
      } catch (err) {
        console.error('Failed to load GPU status', err)
      }
    }
    fetchStatus()
  }, [])

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


  const handleSave = async () => {
    const result = await save.mutate(form)
    if (result !== undefined) {
      toast.success('LLM configuration saved')
      void refetch()
    } else if (save.error) {
      toast.error(save.error)
    }
  }

  const handleTestConnection = async () => {
    setIsTesting(true)
    setTestResult(null)
    toast.info('Testing connection to LLM provider...')
    try {
      const res = await testLLMConnection(form)
      if (res.success) {
        setTestResult({ success: true, message: res.message })
        toast.success('LLM connection test passed!')
      } else {
        setTestResult({ success: false, message: res.message || 'Connection test failed.' })
        toast.error('LLM connection test failed.')
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Connection test failed.'
      setTestResult({ success: false, message: msg })
      toast.error('LLM connection test failed.')
    } finally {
      setIsTesting(false)
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

  const fields = SERVICE_FIELDS[form.service] ?? {}

  return (
    <div className="max-w-[1400px] mx-auto space-y-8 pb-12 px-4 md:px-6">
      {/* Header */}
      <div className="border-b border-border/20 pb-5">
        <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight text-foreground">Settings</h2>
        <p className="text-xs md:text-sm text-muted-foreground mt-1.5 leading-relaxed">
          Configure language model backends, API credentials, and parameter thresholds.
        </p>
      </div>

      <div className="space-y-6">
        {/* LLM Integration Title */}
        <div className="space-y-2">
          <h3 className="text-xs font-bold tracking-widest text-muted-foreground/80 uppercase pb-2 border-b border-border/20 flex items-center gap-2">
            <Sliders className="w-4 h-4 text-primary" />
            LLM Integration
          </h3>
          <p className="text-xs text-muted-foreground leading-relaxed max-w-3xl">
            Enabling an LLM allows Marker to format complex tables, clean up headers/footers, and dramatically improve OCR transcription accuracy.
          </p>
        </div>

        {/* Provider Selection Grid */}
        <div className="space-y-3 pt-2">
          <label className="text-[10px] font-bold tracking-widest text-muted-foreground/80 uppercase block">
            Choose Service Provider
          </label>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {LLM_SERVICES.map((svc) => {
              const isActive = form.service === svc.value
              return (
                <button
                  key={svc.value}
                  type="button"
                  onClick={() => {
                    setForm((f) => ({ ...f, service: svc.value }))
                    setTestResult(null)
                  }}
                  className={cn(
                    'flex items-start gap-3 p-3.5 rounded-xl border text-left transition-all duration-200 hover:scale-[1.002]',
                    isActive
                      ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                      : 'border-border/50 bg-card/45 text-muted-foreground hover:bg-muted/30 hover:border-border hover:text-foreground'
                  )}
                >
                  <div className={cn(
                    'p-2 rounded-lg shrink-0 mt-0.5 border',
                    isActive 
                      ? 'bg-primary-foreground/10 border-primary-foreground/20 text-primary-foreground' 
                      : 'bg-muted border-border/30 text-muted-foreground'
                  )}>
                    <ServiceIcon name={svc.icon} className="w-4.5 h-4.5" />
                  </div>
                  <div>
                    <div className={cn('font-semibold text-sm leading-none mb-1', isActive ? 'text-primary-foreground' : 'text-foreground')}>{svc.label}</div>
                    <div className={cn('text-xs leading-normal', isActive ? 'text-primary-foreground/80' : 'text-muted-foreground/95')}>{svc.desc}</div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Dynamic Configuration Form Fields */}
        {form.service !== 'none' && (
          <div className="space-y-4 pt-6 border-t border-border/20 animate-fade-in">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              
              {fields.apiKey && (
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold tracking-widest text-muted-foreground/80 uppercase flex items-center gap-1.5">
                    <Key className="w-3.5 h-3.5" />
                    {form.service === 'vertex' ? 'Google Cloud Project ID' : 'API Key'}
                  </label>
                  <Input
                    type="password"
                    value={form.api_key}
                    onChange={(e) => setForm((f) => ({ ...f, api_key: e.target.value }))}
                    placeholder={form.service === 'vertex' ? 'e.g., my-gcp-project-123' : 'Enter your credential token'}
                    className="bg-background/50"
                  />
                </div>
              )}

              {fields.baseUrl && (
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold tracking-widest text-muted-foreground/80 uppercase flex items-center gap-1.5">
                    <Globe className="w-3.5 h-3.5" />
                    {form.service === 'azure' ? 'Endpoint URL' : 'Base URL'}
                  </label>
                  <Input
                    value={form.base_url}
                    onChange={(e) => setForm((f) => ({ ...f, base_url: e.target.value }))}
                    placeholder={
                      form.service === 'azure'
                        ? 'https://your-resource.openai.azure.com'
                        : form.service === 'ollama'
                        ? 'http://localhost:11434'
                        : 'https://api.example.com/v1'
                    }
                    className="bg-background/50"
                  />
                </div>
              )}

              {fields.model && (
                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-[10px] font-bold tracking-widest text-muted-foreground/80 uppercase flex items-center gap-1.5">
                    <Cpu className="w-3.5 h-3.5" />
                    {form.service === 'azure' ? 'Deployment Name' : 'Model Identifier'}
                  </label>
                  <Input
                    value={form.model_name}
                    onChange={(e) => setForm((f) => ({ ...f, model_name: e.target.value }))}
                    placeholder={
                      form.service === 'gemini'
                        ? 'e.g., gemini-2.0-flash (default)'
                        : form.service === 'claude'
                        ? 'e.g., claude-3-5-sonnet-20241022 (default)'
                        : form.service === 'openai'
                        ? 'e.g., gpt-4o-mini (default)'
                        : form.service === 'ollama'
                        ? 'e.g., llama3.2-vision (default)'
                        : 'Provide the exact model identifier string'
                      }
                      className="bg-background/50"
                    />
                  </div>
                )}
              </div>

              {/* Threshold numeric settings */}
              <div className="grid grid-cols-3 gap-3 pt-2">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold tracking-widest text-muted-foreground/80 uppercase">Timeout (s)</label>
                  <Input
                    type="number"
                    value={form.timeout}
                    onChange={(e) => setForm((f) => ({ ...f, timeout: Number(e.target.value) }))}
                    className="bg-background/50 text-center"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold tracking-widest text-muted-foreground/80 uppercase">Max Retries</label>
                  <Input
                    type="number"
                    value={form.max_retries}
                    onChange={(e) => setForm((f) => ({ ...f, max_retries: Number(e.target.value) }))}
                    className="bg-background/50 text-center"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold tracking-widest text-muted-foreground/80 uppercase">Max Output Tokens</label>
                  <Input
                    type="number"
                    value={form.max_output_tokens}
                    onChange={(e) => setForm((f) => ({ ...f, max_output_tokens: Number(e.target.value) }))}
                    className="bg-background/50 text-center"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Test connection result block */}
          {testResult && (
            <div className={cn(
              'p-4 rounded-xl border flex items-start gap-3 animate-fade-in mt-4',
              testResult.success
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-800 dark:text-emerald-300'
                : 'bg-destructive/10 border-destructive/30 text-destructive'
            )}>
              {testResult.success ? (
                <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-500 mt-0.5" />
              ) : (
                <AlertTriangle className="w-5 h-5 shrink-0 text-destructive mt-0.5" />
              )}
              <div>
                <div className="font-semibold text-sm">{testResult.success ? 'Connection Successful' : 'Connection Failed'}</div>
                <div className="text-xs mt-1 leading-normal opacity-90 font-mono whitespace-pre-wrap">{testResult.message}</div>
              </div>
            </div>
          )}

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
                    'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2',
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
                {/* Progress and status message */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-foreground">
                      {gpuStatus.status === 'installing' && 'Downloading & Installing Backend Components...'}
                      {gpuStatus.status === 'ready' && 'GPU Acceleration is active and verified.'}
                      {gpuStatus.status === 'failed' && 'Installation failed.'}
                    </span>
                    <span className="font-semibold text-muted-foreground">{gpuStatus.progress}%</span>
                  </div>
                  <Progress value={gpuStatus.progress} className="h-1.5" />
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
                    <div className="h-40 overflow-y-auto p-3 bg-black/60 rounded-lg text-[11px] font-mono text-emerald-400 border border-border/10 space-y-1 select-text scrollbar-thin font-semibold">
                      {gpuStatus.logs.map((log, i) => (
                        <div key={i} className="whitespace-pre-wrap leading-relaxed">{log}</div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

      </div>

      {/* Form Action Controls */}
      <div className="flex items-center gap-3 pt-4 border-t border-border/20">
        <Button
          onClick={handleSave}
          disabled={save.isPending || isTesting}
          className="px-5 shadow-sm rounded-lg hover:shadow-primary/10 transition-all text-xs font-bold uppercase tracking-wider"
        >
          {save.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
          ) : (
            <Save className="w-4 h-4 mr-2" />
          )}
          Save Configuration
        </Button>
        
        {form.service !== 'none' && (
          <Button
            variant="outline"
            onClick={handleTestConnection}
            disabled={save.isPending || isTesting}
            className="px-5 rounded-lg border-border/60 hover:bg-muted/50 transition-colors text-xs font-bold uppercase tracking-wider"
          >
            {isTesting ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2 text-primary" />
            ) : (
              <TestTube className="w-4 h-4 mr-2 text-muted-foreground" />
            )}
            {isTesting ? 'Testing connection...' : 'Test Connection'}
          </Button>
        )}
      </div>
    </div>
  )
}

