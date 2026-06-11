import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ConvertPage } from '@/pages/ConvertPage'
import { ConversionProvider } from '@/hooks/useConversionQueue'
import { BrowserRouter } from 'react-router-dom'
import '@testing-library/jest-dom'

// Mock the API module
const mockUploadFile = vi.fn()
const mockGetJobEvents = vi.fn()
const mockDownloadResult = vi.fn()
const mockDeleteJob = vi.fn()
const mockGetJobStatus = vi.fn()

vi.mock('@/lib/api', () => ({
  uploadFile: (...args: any[]) => mockUploadFile(...args),
  getJobEvents: (...args: any[]) => mockGetJobEvents(...args),
  downloadResult: (...args: any[]) => mockDownloadResult(...args),
  deleteJob: (...args: any[]) => mockDeleteJob(...args),
  getJobStatus: (...args: any[]) => mockGetJobStatus(...args),
  browseFiles: vi.fn(),
  browseFolder: vi.fn(),
}))

// Mock EventSource helper
interface MockEventSource {
  addEventListener: ReturnType<typeof vi.fn>
  close: ReturnType<typeof vi.fn>
  onerror: (() => void) | null
}

function createMockEventSource(): MockEventSource {
  return {
    addEventListener: vi.fn(),
    close: vi.fn(),
    onerror: null,
  }
}

describe('ConvertPage Integration with real hook', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockUploadFile.mockResolvedValue({
      job_id: 'job-uuid-123',
      status: 'pending',
      filename: 'test.pdf'
    })
    mockGetJobEvents.mockReturnValue(createMockEventSource())
  })

  it('submits conversion and renders queue item without crashing', async () => {
    const { container } = render(
      <BrowserRouter>
        <ConversionProvider>
          <ConvertPage />
        </ConversionProvider>
      </BrowserRouter>
    )

    // Verify it renders initial empty state
    expect(screen.getByRole('heading', { name: 'Convert Document' })).toBeInTheDocument()
    expect(screen.getByText('Queue is empty')).toBeInTheDocument()

    // Click the Local Paths tab
    const localPathsTab = screen.getByRole('button', { name: /local paths/i })
    fireEvent.click(localPathsTab)

    // Select local path text area and add a path to enable the button
    const textarea = container.querySelector('textarea')!
    fireEvent.change(textarea, { target: { value: 'C:\\test_document.pdf' } })
    
    console.log('TEXTAREA VALUE:', textarea.value)
    
    const convertBtn = screen.getByRole('button', { name: /convert/i })
    console.log('BUTTON TEXT:', convertBtn.textContent, 'DISABLED:', convertBtn.hasAttribute('disabled'))
    expect(convertBtn).toBeInTheDocument()
    expect(convertBtn).not.toBeDisabled()

    // Click convert button
    fireEvent.click(convertBtn)

    // Wait for the job card to appear in the queue list
    await waitFor(() => {
      expect(screen.getByText('test_document.pdf')).toBeInTheDocument()
    })

    // Check overall progress and console logs rendering
    expect(screen.getByText('Conversion Queue (1)')).toBeInTheDocument()
    expect(screen.getByText('Processing document...')).toBeInTheDocument()
  })
})
