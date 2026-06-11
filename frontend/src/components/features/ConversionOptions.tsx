import { useState } from 'react'
import { createPortal } from 'react-dom'
import { FileText, Code, Braces, Layers, HelpCircle, Settings2, X } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import type { ConversionConfig, OutputFormat, ConverterType } from '@/lib/api'

interface ConversionOptionsProps {
  config: ConversionConfig
  onChange: (config: ConversionConfig) => void
  disabled?: boolean
}

const OUTPUT_FORMATS: { value: OutputFormat; label: string; desc: string; icon: typeof FileText }[] = [
  { value: 'markdown', label: 'Markdown', desc: 'Standard formatted Markdown', icon: FileText },
  { value: 'json', label: 'JSON', desc: 'Structured JSON layout metadata', icon: Braces },
  { value: 'html', label: 'HTML', desc: 'Rendered HTML structure', icon: Code },
  { value: 'chunks', label: 'Chunks', desc: 'Fragmented text layout chunks', icon: Layers },
]

const CONVERTERS: { value: ConverterType; label: string; desc: string }[] = [
  { value: 'PdfConverter', label: 'Standard PDF', desc: 'Extracts layout, text, tables, and images' },
  { value: 'TableConverter', label: 'Table Focused', desc: 'Optimized for spreadsheet/table sheets' },
  { value: 'OCRConverter', label: 'OCR Extraction', desc: 'Best for scanned or low-quality documents' },
  { value: 'ExtractionConverter', label: 'Fast Text', desc: 'Quick plain-text parser without heavy styles' },
]

export function ConversionOptions({ config, onChange, disabled }: ConversionOptionsProps) {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [tempConfig, setTempConfig] = useState<ConversionConfig>(config)

  const update = <K extends keyof ConversionConfig>(key: K, value: ConversionConfig[K]) => {
    onChange({ ...config, [key]: value })
  }

  const openModal = () => {
    setTempConfig({ ...config })
    setIsModalOpen(true)
  }

  const handleSave = () => {
    onChange(tempConfig)
    setIsModalOpen(false)
    toast.success('Advanced settings applied successfully!')
  }

  const updateTemp = <K extends keyof ConversionConfig>(key: K, value: ConversionConfig[K]) => {
    setTempConfig((prev) => ({ ...prev, [key]: value }))
  }

  return (
    <div className="space-y-6">
      {/* Output Format */}
      <div className="space-y-3">
        <label className="text-[10px] font-bold tracking-widest text-muted-foreground/80 uppercase block">
          Output Format
        </label>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {OUTPUT_FORMATS.map((fmt) => {
            const isActive = config.output_format === fmt.value
            return (
              <button
                key={fmt.value}
                type="button"
                onClick={() => update('output_format', fmt.value)}
                disabled={disabled}
                className={cn(
                  'flex flex-col items-center justify-center p-3.5 rounded-xl border text-center transition-all duration-200 hover:scale-[1.01]',
                  isActive
                    ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                    : 'border-border/60 bg-card/45 text-muted-foreground hover:bg-muted/30 hover:text-foreground'
                )}
              >
                <fmt.icon className={cn('w-5 h-5 mb-1.5', isActive ? 'text-primary-foreground' : 'text-muted-foreground')} />
                <span className={cn('font-semibold text-xs block', isActive ? 'text-primary-foreground' : 'text-foreground')}>{fmt.label}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Converter Type */}
      <div className="space-y-3">
        <label className="text-[10px] font-bold tracking-widest text-muted-foreground/80 uppercase block">
          Converter Engine
        </label>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {CONVERTERS.map((conv) => {
            const isActive = config.converter === conv.value
            return (
              <button
                key={conv.value}
                type="button"
                onClick={() => update('converter', conv.value)}
                disabled={disabled}
                className={cn(
                  'p-4 rounded-xl border text-left transition-all duration-200 hover:scale-[1.002]',
                  isActive
                    ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                    : 'border-border/60 bg-card/45 text-muted-foreground hover:bg-muted/30 hover:text-foreground'
                )}
              >
                <span className={cn('block font-semibold text-xs', isActive ? 'text-primary-foreground' : 'text-foreground')}>{conv.label}</span>
                <span className={cn('block text-[11px] mt-1 leading-normal', isActive ? 'text-primary-foreground/85' : 'text-muted-foreground/90')}>
                  {conv.desc}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Advanced Toggle */}
      <div className="pt-3 border-t border-border/20">
        <button
          type="button"
          onClick={openModal}
          disabled={disabled}
          className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/80 hover:text-foreground transition-colors disabled:opacity-50"
        >
          <Settings2 className="w-4 h-4 text-primary" />
          <span>Configure Advanced Settings</span>
        </button>
      </div>

      {/* Popup Dialog Modal */}
      {isModalOpen && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-overlay-fade-in">
          <div className="glass-card max-w-lg w-full bg-background border border-border/50 rounded-2xl shadow-xl overflow-hidden animate-modal-zoom-in flex flex-col max-h-[90vh] text-left">
            
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border/20">
              <div className="flex items-center gap-2.5">
                <Settings2 className="w-5 h-5 text-primary" />
                <div>
                  <h3 className="font-extrabold text-sm text-foreground uppercase tracking-wider">Advanced Options</h3>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Fine-tune converters, OCR, and model overrides.</p>
                </div>
              </div>
              <button 
                type="button" 
                onClick={() => setIsModalOpen(false)} 
                className="p-1 rounded-md text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <ToggleOption
                label="Enable LLM Integration"
                description="Use a Large Language Model (Gemini, Claude, GPT, etc.) to format tables, clean up layout artifacts, and fix extraction errors."
                checked={tempConfig.use_llm ?? false}
                onChange={(v) => updateTemp('use_llm', v)}
                disabled={disabled}
              />

              {tempConfig.use_llm && (
                <div className="pl-4 border-l border-primary/20 space-y-2 animate-fade-in">
                  <label className="text-[10px] font-bold tracking-widest text-muted-foreground/80 uppercase block">
                    LLM Model Override
                  </label>
                  <Input
                    value={tempConfig.llm_model ?? ''}
                    onChange={(e) => updateTemp('llm_model', e.target.value)}
                    placeholder="Leave blank for default (e.g. gemini-2.0-flash)"
                    disabled={disabled}
                    className="bg-background/50 h-9 text-xs"
                  />
                </div>
              )}

              <ToggleOption 
                label="Force OCR on All Pages" 
                description="Force Optical Character Recognition on all pages. Recommended for scans with corrupt or missing text layers."
                checked={tempConfig.force_ocr ?? false} 
                onChange={(v) => updateTemp('force_ocr', v)} 
                disabled={disabled} 
              />

              <ToggleOption 
                label="Paginate Output Layout" 
                description="Include page breaks and page numbers in the output Markdown to match the original document pagination."
                checked={tempConfig.paginate ?? false} 
                onChange={(v) => updateTemp('paginate', v)} 
                disabled={disabled} 
              />

              <ToggleOption 
                label="Disable Image Extraction" 
                description="Skip extracting and saving images. Speeds up processing and reduces final file size."
                checked={tempConfig.disable_image_extraction ?? false} 
                onChange={(v) => updateTemp('disable_image_extraction', v)} 
                disabled={disabled} 
              />

              {/* Text fields */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <label className="text-[10px] font-bold tracking-widest text-muted-foreground/80 uppercase block">
                      Page Range
                    </label>
                    <HelpIcon text="Convert only specific pages. Format: '1-10', '1,3,5', or '1-5,7-9'." />
                  </div>
                  <Input
                    value={tempConfig.page_range ?? ''}
                    onChange={(e) => updateTemp('page_range', e.target.value)}
                    placeholder="e.g. 1-10"
                    disabled={disabled}
                    className="bg-background/50 h-9 text-xs"
                  />
                </div>
                
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <label className="text-[10px] font-bold tracking-widest text-muted-foreground/80 uppercase block">
                      Language Hint
                    </label>
                    <HelpIcon text="Primary language code (e.g., 'en', 'es', 'fr') to improve OCR spelling and character recognition." />
                  </div>
                  <Input
                    value={tempConfig.language ?? ''}
                    onChange={(e) => updateTemp('language', e.target.value)}
                    placeholder="e.g. en"
                    disabled={disabled}
                    className="bg-background/50 h-9 text-xs"
                  />
                </div>
              </div>

              <ToggleOption 
                label="Disable Multiprocessing" 
                description="Run conversion on a single thread. Saves CPU and RAM on resource-constrained systems."
                checked={tempConfig.disable_multiprocessing ?? false} 
                onChange={(v) => updateTemp('disable_multiprocessing', v)} 
                disabled={disabled} 
              />

              <ToggleOption 
                label="Debug Execution Mode" 
                description="Stream verbose internal logs and keep intermediate temp files to help troubleshoot conversion issues."
                checked={tempConfig.debug ?? false} 
                onChange={(v) => updateTemp('debug', v)} 
                disabled={disabled} 
              />
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border/20 bg-muted/10">
              <Button 
                variant="ghost" 
                onClick={() => setIsModalOpen(false)}
                className="text-xs font-bold uppercase tracking-wider px-4 rounded-lg h-10"
              >
                Cancel
              </Button>
              <Button 
                onClick={handleSave}
                className="text-xs font-bold uppercase tracking-wider px-5 rounded-lg shadow-sm h-10"
              >
                Apply Settings
              </Button>
            </div>
            
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}

// ─── Help Icon Helper ───────────────────────────────────────────────────

function HelpIcon({ text }: { text: string }) {
  return (
    <div className="group relative">
      <HelpCircle className="w-3.5 h-3.5 text-muted-foreground/60 hover:text-muted-foreground cursor-help" />
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover:block w-48 p-2 rounded-lg bg-slate-900 dark:bg-slate-800 text-[10px] leading-normal text-slate-100 shadow-lg border border-slate-800/80 z-20 pointer-events-none text-left">
        {text}
      </div>
    </div>
  )
}

// ─── Toggle Option ───────────────────────────────────────────────────

function ToggleOption({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: string
  description?: string
  checked: boolean
  onChange: (value: boolean) => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      disabled={disabled}
      className={cn(
        'flex items-start justify-between w-full p-2.5 rounded-xl border border-transparent transition-all',
        'hover:bg-muted/30 hover:border-border/30',
        disabled && 'opacity-50 pointer-events-none'
      )}
    >
      <div className="text-left max-w-[85%]">
        <span className="text-xs font-semibold text-foreground block">{label}</span>
        {description && (
          <span className="block text-[11px] text-muted-foreground mt-0.5 leading-normal">
            {description}
          </span>
        )}
      </div>
      <div
        className={cn(
          'w-9 h-5 rounded-full transition-colors relative shrink-0 mt-0.5 border border-border/10',
          checked ? 'bg-primary' : 'bg-muted'
        )}
      >
        <div
          className={cn(
            'absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white shadow-sm transition-transform duration-200',
            checked ? 'left-[17px]' : 'left-0.5'
          )}
        />
      </div>
    </button>
  )
}
