import { useCallback, useRef, useState } from 'react'
import { UploadCloud, FileText, X, FileImage, FileCode, FileSpreadsheet } from 'lucide-react'
import { cn } from '@/lib/utils'

const ACCEPTED_EXTENSIONS = '.pdf,.docx,.xlsx,.pptx,.epub,.html,.htm,.jpg,.jpeg,.png,.webp,.gif,.bmp,.tiff'

interface FileUploadProps {
  onFileSelect: (file: File) => void
  selectedFile: File | null
  onClear: () => void
  disabled?: boolean
}

function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

function getFileIcon(name: string) {
  const ext = name.split('.').pop()?.toLowerCase() || ''
  const imageExts = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'tiff']
  const spreadsheetExts = ['xlsx', 'xls', 'csv']
  const codeExts = ['html', 'htm', 'json', 'xml', 'js', 'ts']
  
  if (imageExts.includes(ext)) return FileImage
  if (spreadsheetExts.includes(ext)) return FileSpreadsheet
  if (codeExts.includes(ext)) return FileCode
  return FileText
}

export function FileUpload({ onFileSelect, selectedFile, onClear, disabled }: FileUploadProps) {
  const [isDragOver, setIsDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      if (disabled) return
      setIsDragOver(false)
      const file = e.dataTransfer.files[0]
      if (file) onFileSelect(file)
    },
    [onFileSelect, disabled]
  )

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (disabled) return
      const file = e.target.files?.[0]
      if (file) onFileSelect(file)
    },
    [onFileSelect, disabled]
  )

  if (selectedFile) {
    const Icon = getFileIcon(selectedFile.name)
    return (
      <div className="glass-card p-4 animate-fade-in border border-primary/20 bg-primary/5">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-11 h-11 rounded-xl bg-primary/10 text-primary shrink-0">
            <Icon className="w-5.5 h-5.5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate text-foreground">{selectedFile.name}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {formatSize(selectedFile.size)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClear}
            disabled={disabled}
            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-all duration-200 hover:scale-105 active:scale-95 disabled:opacity-50"
            aria-label="Remove file"
          >
            <X className="w-4.5 h-4.5" />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        if (disabled) return
        setIsDragOver(true)
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={handleDrop}
      onClick={() => {
        if (!disabled) inputRef.current?.click()
      }}
      className={cn(
        'relative flex flex-col items-center justify-center gap-4 p-8 rounded-2xl border-2 border-dashed cursor-pointer transition-all duration-300 ease-out select-none',
        isDragOver
          ? 'border-primary bg-primary/5 scale-[1.015] shadow-md shadow-primary/5'
          : 'border-border/60 hover:border-primary/50 hover:bg-muted/20',
        disabled && 'opacity-50 pointer-events-none'
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_EXTENSIONS}
        onChange={handleChange}
        className="hidden"
      />
      
      {/* Upload Icon Widget */}
      <div className={cn(
        'flex items-center justify-center w-14 h-14 rounded-2xl transition-all duration-300 shadow-sm border border-transparent',
        isDragOver 
          ? 'bg-primary/20 text-primary scale-110 border-primary/20' 
          : 'bg-muted/80 text-muted-foreground group-hover:scale-105 hover:bg-muted'
      )}>
        <UploadCloud className={cn('w-6.5 h-6.5 transition-transform duration-300', isDragOver && 'animate-bounce')} />
      </div>

      <div className="text-center space-y-1">
        <p className="text-sm font-semibold text-foreground">
          {isDragOver ? 'Release to upload your file' : 'Drag & drop file here or click to browse'}
        </p>
        <p className="text-xs text-muted-foreground/90 max-w-[280px] leading-relaxed">
          Supports PDF, DOCX, XLSX, PPTX, EPUB, HTML, and images (up to 50MB)
        </p>
      </div>
    </div>
  )
}
