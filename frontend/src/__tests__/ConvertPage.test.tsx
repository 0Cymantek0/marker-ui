import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ConvertPage } from '@/pages/ConvertPage'
import '@testing-library/jest-dom'

// Mock useConversionQueue hook
const mockUseConversionQueue = vi.fn()
vi.mock('@/hooks/useConversionQueue', () => ({
  useConversionQueue: () => mockUseConversionQueue()
}))

// Mock components that we don't want to render in full depth or that have external deps
vi.mock('@/components/features/FileUpload', () => ({
  FileUpload: () => <div data-testid="file-upload">FileUpload</div>
}))

vi.mock('@/components/features/ConversionOptions', () => ({
  ConversionOptions: () => <div data-testid="conversion-options">ConversionOptions</div>
}))

vi.mock('@/components/features/TerminalLog', () => ({
  TerminalLog: ({ logs, onClose }: { logs: string[]; onClose?: () => void }) => (
    <div data-testid="terminal-log">
      TerminalLog Logs Count: {logs.length}
      {onClose && (
        <button onClick={onClose}>Close console</button>
      )}
    </div>
  )
}))

describe('ConvertPage component', () => {
  it('renders initial state with empty queue and console closed by default', () => {
    mockUseConversionQueue.mockReturnValue({
      jobs: [],
      start: vi.fn(),
      cancel: vi.fn(),
      download: vi.fn(),
      clearLogs: vi.fn(),
      removeJob: vi.fn(),
    })

    render(<ConvertPage />)

    // Check headers and uploads
    expect(screen.getByRole('heading', { name: 'Convert Document' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Convert Document' })).toBeInTheDocument()
    expect(screen.getByTestId('file-upload')).toBeInTheDocument()
    expect(screen.getByTestId('conversion-options')).toBeInTheDocument()

    // Console logs is closed by default
    expect(screen.queryByTestId('terminal-log')).not.toBeInTheDocument()
    expect(screen.getByText('Open Console')).toBeInTheDocument()
  })

  it('renders queue items and overall progress without crash', () => {
    mockUseConversionQueue.mockReturnValue({
      jobs: [
        {
          id: 'job-1',
          filename: 'test.pdf',
          file: null,
          localPath: 'C:\\test.pdf',
          phase: 'completed',
          progress: 100,
          statusText: 'Conversion complete',
          jobId: 'job-uuid-1',
          error: null,
          resultBlob: new Blob(),
          logs: ['log line 1'],
          outputFormat: 'markdown'
        }
      ],
      start: vi.fn(),
      cancel: vi.fn(),
      download: vi.fn(),
      clearLogs: vi.fn(),
      removeJob: vi.fn(),
    })

    render(<ConvertPage />)

    // Queue list should show 1 job
    expect(screen.getByText('Conversion Queue (1)')).toBeInTheDocument()
    expect(screen.getByText('test.pdf')).toBeInTheDocument()
    expect(screen.getByText('Overall:')).toBeInTheDocument()
    expect(screen.getByText('1 of 1 completed')).toBeInTheDocument()
    expect(screen.getByText('100%')).toBeInTheDocument()
  })

  it('toggles console visibility when clicking the console buttons', () => {
    mockUseConversionQueue.mockReturnValue({
      jobs: [],
      start: vi.fn(),
      cancel: vi.fn(),
      download: vi.fn(),
      clearLogs: vi.fn(),
      removeJob: vi.fn(),
    })

    render(<ConvertPage />)

    // Initially console is closed
    expect(screen.queryByTestId('terminal-log')).not.toBeInTheDocument()
    expect(screen.getByText('Open Console')).toBeInTheDocument()

    // Click Open Console button
    fireEvent.click(screen.getByText('Open Console'))

    // Now console is visible
    expect(screen.getByTestId('terminal-log')).toBeInTheDocument()
    expect(screen.getByText('TerminalLog Logs Count: 0')).toBeInTheDocument()

    // Click close button
    fireEvent.click(screen.getByText('Close console'))

    // Console is closed again
    expect(screen.queryByTestId('terminal-log')).not.toBeInTheDocument()
  })
})
