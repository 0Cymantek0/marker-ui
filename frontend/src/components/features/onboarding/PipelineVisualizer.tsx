import { PipelineStep, StepStatus } from './PipelineStep'
import type { ModelDownloadInfo } from '@/lib/api'

interface PipelineVisualizerProps {
  models: Record<string, ModelDownloadInfo>
}

interface PipelineItem {
  key: string
  step: string
  title: string
  desc: string
}

const PIPELINE_ORDER: PipelineItem[] = [
  {
    key: 'text_detection',
    step: '01',
    title: 'Text Detection',
    desc: 'Locates word and line boundaries across document pages.',
  },
  {
    key: 'layout',
    step: '02',
    title: 'Layout Segmentation',
    desc: 'Analyzes document layouts to separate columns, text, headers, and images.',
  },
  {
    key: 'text_recognition',
    step: '03',
    title: 'Text Recognition (OCR)',
    desc: 'High-accuracy neural OCR for converting image text into Unicode strings.',
  },
  {
    key: 'table_recognition',
    step: '04',
    title: 'Table Structure Analysis',
    desc: 'Identifies grid cells, column alignments, and nested structures in tables.',
  },
  {
    key: 'ocr_error_detection',
    step: '05',
    title: 'OCR Refinement',
    desc: 'Fixes common optical character recognition errors and spelling slips.',
  },
]

export function PipelineVisualizer({ models }: PipelineVisualizerProps) {
  return (
    <div className="space-y-6">
      <div className="space-y-1.5 pb-2 border-b border-border/40">
        <h3 className="text-[10px] uppercase tracking-widest font-extrabold text-muted-foreground/60">
          Marker Processing Pipeline
        </h3>
        <p className="text-[10px] text-muted-foreground/40 font-medium">
          The sequential neural network components responsible for document conversion.
        </p>
      </div>

      <div className="relative">
        <div className="relative space-y-0 z-10">
          {PIPELINE_ORDER.map((item, index) => {
            const model = models[item.key]
            const status: StepStatus = (model?.status as StepStatus) || 'pending'
            const progress = model?.progress || 0
            const downloadedBytes = model?.downloaded_bytes || 0
            const totalBytes = model?.total_bytes || 0

            const isLast = index === PIPELINE_ORDER.length - 1
            const nextStepKey = !isLast ? PIPELINE_ORDER[index + 1]?.key : null
            const nextStatus: StepStatus | undefined = nextStepKey
              ? (models[nextStepKey]?.status as StepStatus) || 'pending'
              : undefined

            return (
              <PipelineStep
                key={item.key}
                stepNumber={item.step}
                title={item.title}
                description={item.desc}
                status={status}
                progress={progress}
                downloadedBytes={downloadedBytes}
                totalBytes={totalBytes}
                isLast={isLast}
                nextStatus={nextStatus}
              />
            )
          })}
        </div>
      </div>
    </div>
  )
}
