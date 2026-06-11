import { Terminal, ShieldCheck } from 'lucide-react'
import type { ModelTrackerStatus } from '@/lib/api'

interface DeveloperConsoleProps {
  status: ModelTrackerStatus
}

function formatBytes(bytes: number, decimals = 1): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i]
}

export function DeveloperConsole({ status }: DeveloperConsoleProps) {
  const isDownloading = status.overall.status === 'downloading'
  const isCompleted = status.overall.status === 'completed' || status.initialized

  // Collect all files currently downloading
  const activeFiles = Object.entries(status.models)
    .filter(([_, m]) => m.status === 'downloading')
    .flatMap(([_, m]) =>
      Object.entries(m.files)
        .filter(([_, f]) => f.status === 'downloading')
        .map(([filename, f]) => ({
          filename,
          downloaded: f.downloaded_bytes,
          total: f.total_bytes,
        }))
    )

  return (
    <div className="w-full bg-slate-950/40 border border-slate-900 rounded-xl overflow-hidden font-mono text-xs">
      {/* Terminal Header Bar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-900/60 border-b border-slate-800/80 select-none">
        <div className="flex items-center gap-2">
          {/* Mock Window Dots */}
          <div className="w-2.5 h-2.5 rounded-full bg-rose-500/80" />
          <div className="w-2.5 h-2.5 rounded-full bg-amber-500/80" />
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/80" />
        </div>
        <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider flex items-center gap-1">
          <Terminal className="w-3 h-3 text-slate-500" />
          engine-diagnostics.sh
        </span>
        <div className="w-12" /> {/* spacer for center alignment */}
      </div>

      {/* Terminal Content Screen */}
      <div className="p-4 space-y-2.5 min-h-[160px] max-h-[200px] overflow-y-auto text-slate-300">
        <div className="flex items-center gap-2 text-slate-500">
          <span>$</span>
          <span>./marker-engine --init --verbose</span>
        </div>

        <div className="text-violet-400">
          [SYSTEM] Initializing Marker AI Conversion Engine...
        </div>

        {status.error && (
          <div className="text-rose-400 animate-pulse">
            [ERROR] Setup halted: {status.error}
          </div>
        )}

        {isDownloading && activeFiles.length > 0 && (
          <div className="space-y-1">
            <div className="text-amber-400">[DOWNLOAD] Fetching remote weights:</div>
            {activeFiles.map((file) => (
              <div
                key={file.filename}
                className="pl-4 flex items-center justify-between text-slate-400 hover:text-slate-200 transition-colors"
              >
                <span className="truncate max-w-[55%] text-slate-400 font-mono">
                  &gt; {file.filename}
                </span>
                <span className="shrink-0 text-violet-400/90 font-mono text-[10px] bg-slate-900/60 border border-slate-800 px-1.5 py-0.5 rounded">
                  {formatBytes(file.downloaded)}
                  {file.total > 0 && ` / ${formatBytes(file.total)}`}
                </span>
              </div>
            ))}
          </div>
        )}

        {isCompleted && (
          <div className="space-y-1.5 animate-fade-in">
            <div className="text-emerald-400 flex items-center gap-1">
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>[SUCCESS] All weights verification completed.</span>
            </div>
            <div className="text-slate-500 pl-5">
              Engine ready. Directing to workspace...
            </div>
          </div>
        )}

        {!isDownloading && !isCompleted && !status.error && (
          <div className="text-slate-500">[SYSTEM] Awaiting setup instruction...</div>
        )}
      </div>
    </div>
  )
}
