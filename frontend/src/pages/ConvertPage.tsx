import { useState, useCallback, useEffect } from 'react'
import { Play, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { FileUpload } from '@/components/features/FileUpload'
import { ConversionOptions } from '@/components/features/ConversionOptions'
import { ConversionProgress } from '@/components/features/ConversionProgress'
import { OutputViewer } from '@/components/features/OutputViewer'
import { TerminalLog } from '@/components/features/TerminalLog'
import { useConversion } from '@/hooks/useConversion'
import type { ConversionConfig } from '@/lib/api'

const DEFAULT_CONFIG: ConversionConfig = {
  output_format: 'markdown',
  converter: 'PdfConverter',
  use_llm: false,
  force_ocr: false,
  paginate: false,
  disable_image_extraction: false,
  page_range: '',
  language: '',
  disable_multiprocessing: false,
  debug: false,
}

export function ConvertPage() {
  const [file, setFile] = useState<File | null>(null)
  const [config, setConfig] = useState<ConversionConfig>(DEFAULT_CONFIG)
  const [outputContent, setOutputContent] = useState<string | null>(null)

  const { state, start, cancel, download, clearLogs, isConverting } = useConversion()

  const handleConvert = useCallback(async () => {
    if (!file) {
      toast.error('Please select a file first')
      return
    }

    setOutputContent(null)

    try {
      await start(file, config)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Conversion failed')
    }
  }, [file, config, start])

  // When conversion completes, extract text and display
  useEffect(() => {
    if (state.phase === 'completed' && state.resultBlob) {
      state.resultBlob.text().then((text) => {
        if (text) setOutputContent(text)
      }).catch(() => {
        // Quiet fail, user can still click Download
      })
    }
  }, [state.phase, state.resultBlob])

  const handleDownload = useCallback(async () => {
    try {
      await download()
      toast.success('Converted package downloaded!')
    } catch {
      toast.error('Failed to download output package.')
    }
  }, [download])

  const getButtonText = () => {
    if (state.phase === 'uploading') return 'Uploading File...'
    if (state.phase === 'processing') return 'Converting Document...'
    const formatLabels: Record<string, string> = {
      markdown: 'Markdown',
      json: 'JSON',
      html: 'HTML',
      chunks: 'Chunks',
    }
    const label = formatLabels[config.output_format] || 'Markdown'
    return `Convert to ${label}`
  }

  return (
    <div className="max-w-[1400px] mx-auto space-y-8 pb-12 px-4 md:px-6">
      {/* Page Header */}
      <div className="border-b border-border/20 pb-5">
        <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight text-foreground">
          Convert Document
        </h2>
        <p className="text-xs md:text-sm text-muted-foreground mt-1.5 max-w-3xl leading-relaxed">
          Transform PDFs, Word documents, spreadsheets, slides, and images into clean, layout-aware, production-ready Markdown files.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 xl:gap-12 items-start">
        {/* Left Column: File Upload Zone & Config Options (5 cols) */}
        <div className="lg:col-span-5 space-y-8">
          
          {/* Step 1: Upload */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold tracking-widest text-muted-foreground/80 uppercase pb-2 border-b border-border/20">
              01 / SOURCE DOCUMENT
            </h3>
            <FileUpload
              onFileSelect={setFile}
              selectedFile={file}
              onClear={() => {
                setFile(null)
                setOutputContent(null)
                clearLogs()
              }}
              disabled={isConverting}
            />
          </div>

          {/* Action: Convert Button */}
          <Button
            onClick={handleConvert}
            disabled={!file || isConverting}
            className="w-full h-12 text-xs font-bold uppercase tracking-wider shadow-md rounded-xl hover:scale-[1.002] active:scale-[0.99] transition-all duration-200"
            size="lg"
          >
            {isConverting ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Play className="w-3.5 h-3.5 mr-2" />
            )}
            {getButtonText()}
          </Button>

          <hr className="border-border/30" />

          {/* Step 2: Settings */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold tracking-widest text-muted-foreground/80 uppercase pb-2 border-b border-border/20">
              02 / CONVERSION PARAMETERS
            </h3>
            <ConversionOptions
              config={config}
              onChange={setConfig}
              disabled={isConverting}
            />
          </div>

        </div>

        {/* Right Column: Execution Terminal & Output Preview (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Progress bar info (optional details) */}
          <ConversionProgress state={state} onCancel={cancel} />
          
          {/* Terminal log panel */}
          <TerminalLog logs={state.logs} phase={state.phase} onClear={clearLogs} />

          {/* Rendered output panel */}
          <OutputViewer
            content={outputContent}
            onDownload={handleDownload}
          />
        </div>
      </div>
    </div>
  )
}
