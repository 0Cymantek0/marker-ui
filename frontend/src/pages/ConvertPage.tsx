import { useState, useCallback, useEffect } from 'react'
import { Play, Loader2, Download, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { FileUpload } from '@/components/features/FileUpload'
import { ConversionOptions } from '@/components/features/ConversionOptions'
import { ConversionProgress } from '@/components/features/ConversionProgress'
import { OutputViewer } from '@/components/features/OutputViewer'
import { TerminalLog } from '@/components/features/TerminalLog'
import { useConversionQueue } from '@/hooks/useConversionQueue'
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
  const [files, setFiles] = useState<File[]>([])
  const [localPaths, setLocalPaths] = useState<string>('')
  const [outputDir, setOutputDir] = useState<string>('')
  const [config, setConfig] = useState<ConversionConfig>(DEFAULT_CONFIG)
  const [outputContent, setOutputContent] = useState<string | null>(null)
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null)

  const { jobs, start, cancel, download, clearLogs, removeJob } = useConversionQueue()

  // Auto-select the latest job if none is selected
  const selectedJob = jobs.find((j) => j.id === selectedJobId) || jobs[jobs.length - 1]

  const handleConvert = useCallback(async () => {
    const parsedLocalPaths = localPaths
      .split('\n')
      .map((p) => p.trim())
      .filter((p) => p.length > 0)

    if (files.length === 0 && parsedLocalPaths.length === 0) {
      toast.error('Please select a file first or specify local paths')
      return
    }

    try {
      await start(files, parsedLocalPaths, config, outputDir)
      setFiles([])
      setLocalPaths('')
      toast.success('Conversion queued successfully!')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Conversion failed')
    }
  }, [files, localPaths, config, outputDir, start])

  // Extract and display text when selected job completes
  useEffect(() => {
    if (!selectedJob) {
      setOutputContent(null)
      return
    }

    if (selectedJob.phase === 'completed' && selectedJob.resultBlob) {
      selectedJob.resultBlob
        .text()
        .then((text) => {
          if (text) setOutputContent(text)
        })
        .catch(() => {
          setOutputContent(null)
        })
    } else {
      setOutputContent(null)
    }
  }, [selectedJob?.id, selectedJob?.phase, selectedJob?.resultBlob])

  const getButtonText = () => {
    const parsedLocalPaths = localPaths
      .split('\n')
      .map((p) => p.trim())
      .filter((p) => p.length > 0)
    const total = files.length + parsedLocalPaths.length
    if (total === 0) return 'Convert Document'
    return `Convert ${total} Document${total > 1 ? 's' : ''}`
  }

  const handleRemoveFile = (idx: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx))
  }

  const handleClearAll = () => {
    setFiles([])
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
              01 / SOURCE DOCUMENTS
            </h3>
            <FileUpload
              onFilesSelect={(newFiles) => setFiles((prev) => [...prev, ...newFiles])}
              selectedFiles={files}
              onRemoveFile={handleRemoveFile}
              onClearAll={handleClearAll}
              localPaths={localPaths}
              onLocalPathsChange={setLocalPaths}
              outputDir={outputDir}
              onOutputDirChange={setOutputDir}
            />
          </div>

          <hr className="border-border/30" />

          {/* Step 2: Settings */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold tracking-widest text-muted-foreground/80 uppercase pb-2 border-b border-border/20">
              02 / CONVERSION PARAMETERS
            </h3>
            <ConversionOptions
              config={config}
              onChange={setConfig}
            />
          </div>

          <hr className="border-border/30" />

          {/* Action: Convert Button */}
          <Button
            onClick={handleConvert}
            disabled={files.length === 0 && localPaths.trim().length === 0}
            className="w-full h-12 text-xs font-bold uppercase tracking-wider shadow-md rounded-xl hover:scale-[1.002] active:scale-[0.99] transition-all duration-200"
            size="lg"
          >
            <Play className="w-3.5 h-3.5 mr-2" />
            {getButtonText()}
          </Button>
        </div>

        {/* Right Column: Execution Terminal & Output Preview (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Queue List */}
          {jobs.length > 0 && (
            <div className="glass-card p-5 space-y-4 animate-fade-in">
              <h3 className="text-xs font-bold tracking-widest text-muted-foreground/80 uppercase pb-2 border-b border-border/20">
                Conversion Queue ({jobs.length})
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[220px] overflow-y-auto pr-1">
                {jobs.map((job) => {
                  const isSelected = selectedJob?.id === job.id
                  const isJobRunning = job.phase === 'uploading' || job.phase === 'processing'

                  return (
                    <div
                      key={job.id}
                      onClick={() => setSelectedJobId(job.id)}
                      className={cn(
                        'p-3 rounded-xl border text-left cursor-pointer transition-all flex flex-col justify-between gap-2.5 select-none relative',
                        isSelected
                          ? 'border-primary bg-primary/5 shadow-sm ring-1 ring-primary/25'
                          : 'border-border/60 bg-card/45 hover:bg-muted/30 hover:border-border'
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold truncate text-foreground" title={job.filename}>
                            {job.filename}
                          </p>
                          <p className="text-[10px] text-muted-foreground/85 mt-0.5 capitalize flex items-center gap-1">
                            {isJobRunning && <Loader2 className="w-2.5 h-2.5 text-primary animate-spin" />}
                            {job.phase === 'completed' && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />}
                            {job.phase === 'failed' && <span className="w-1.5 h-1.5 rounded-full bg-red-500" />}
                            {job.statusText}
                          </p>
                        </div>

                        <div className="flex items-center shrink-0" onClick={(e) => e.stopPropagation()}>
                          {job.phase === 'completed' && (
                            <button
                              onClick={() => download(job.id)}
                              className="p-1 rounded-md hover:bg-muted text-primary hover:text-primary transition-all scale-105 active:scale-95"
                              title="Download result"
                            >
                              <Download className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {isJobRunning && (
                            <button
                              onClick={() => cancel(job.id)}
                              className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-destructive transition-all scale-105 active:scale-95"
                              title="Cancel conversion"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            onClick={() => removeJob(job.id)}
                            className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-destructive transition-all scale-105 active:scale-95"
                            title="Remove from list"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Progress bar inside card */}
                      {isJobRunning && (
                        <div className="w-full bg-muted rounded-full h-1 overflow-hidden mt-0.5">
                          <div
                            className="bg-primary h-full transition-all duration-300"
                            style={{ width: `${job.progress}%` }}
                          />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Selected Job Progress */}
          {selectedJob && (
            <div className="space-y-6">
              <ConversionProgress state={selectedJob} onCancel={() => cancel(selectedJob.id)} />
              
              <TerminalLog
                logs={selectedJob.logs}
                phase={selectedJob.phase}
                onClear={() => clearLogs(selectedJob.id)}
              />

              <OutputViewer
                content={outputContent}
                onDownload={() => download(selectedJob.id)}
              />
            </div>
          )}

          {!selectedJob && (
            <div className="flex flex-col items-center justify-center p-12 border border-dashed border-border/60 rounded-2xl bg-card/10 text-muted-foreground">
              <p className="text-sm">Select files and configure parameters to start conversion.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
