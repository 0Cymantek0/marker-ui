import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { SettingsPage } from '@/pages/SettingsPage'
import * as api from '@/lib/api'
import { toast } from 'sonner'
import '@testing-library/jest-dom'

vi.mock('@/lib/api', () => ({
  getSettings: vi.fn(),
  getGPUStatus: vi.fn(),
  installGPU: vi.fn(),
  toggleGPU: vi.fn(),
  getLLMProviders: vi.fn(),
  saveLLMProviders: vi.fn(),
  getActiveLLM: vi.fn(),
  setActiveLLM: vi.fn(),
  fetchAvailableModels: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  }
}))

describe('SettingsPage component', () => {
  const mockProviders: api.LLMProvider[] = [
    {
      id: 'gemini',
      type: 'gemini',
      label: 'Gemini',
      api_key: 'gemini-key',
      fallback_api_keys: [],
      base_url: '',
      models: [
        { model_id: 'gemini-2.0-flash' }
      ]
    },
    {
      id: 'claude',
      type: 'claude',
      label: 'Claude',
      api_key: '',
      fallback_api_keys: [],
      base_url: '',
      models: [
        { model_id: 'claude-3-7-sonnet' }
      ]
    }
  ]

  const mockActive: api.ActiveLLM = {
    provider_id: 'gemini',
    model_id: 'gemini-2.0-flash'
  }

  const mockSettings = [
    { key: 'gpu_acceleration_enabled', value: 'false', category: 'gpu' }
  ]

  const mockGPUStatus: api.GPUStatus = {
    status: 'ready',
    progress: 100,
    logs: [],
    error_message: null,
    cuda_available: true
  }

  beforeEach(() => {
    vi.restoreAllMocks()
    vi.mocked(api.getLLMProviders).mockResolvedValue(mockProviders)
    vi.mocked(api.getActiveLLM).mockResolvedValue(mockActive)
    vi.mocked(api.getSettings).mockResolvedValue(mockSettings as any)
    vi.mocked(api.getGPUStatus).mockResolvedValue(mockGPUStatus)
  })

  it('renders configured providers and handles draft state correctly on cancel', async () => {
    render(<SettingsPage />)

    // Wait for initial load
    expect(await screen.findByText('Configured Service Providers')).toBeInTheDocument()
    expect(screen.getByText('Gemini')).toBeInTheDocument()

    // Find and click Models button for Gemini
    const modelsButtons = screen.getAllByRole('button', { name: /Models \(\d+\)/ })
    // The first one is for Gemini (models length 1)
    await act(async () => {
      fireEvent.click(modelsButtons[0])
    })

    // Drawer should show
    expect(await screen.findByText('Gemini Models')).toBeInTheDocument()

    // Click cancel in drawer
    const cancelBtn = screen.getByRole('button', { name: 'Cancel' })
    await act(async () => {
      fireEvent.click(cancelBtn)
    })

    // Drawer should close, save function should not be called
    expect(api.saveLLMProviders).not.toHaveBeenCalled()
  })

  it('correctly persists changes only on save', async () => {
    vi.mocked(api.fetchAvailableModels).mockResolvedValue(['gemini-3-flash-preview', 'gemini-2.0-flash'])
    vi.mocked(api.saveLLMProviders).mockResolvedValue(mockProviders)

    render(<SettingsPage />)

    // Wait for load
    await screen.findByText('Configured Service Providers')

    // Open Models drawer for Gemini
    const modelsButtons = screen.getAllByRole('button', { name: /Models \(\d+\)/ })
    await act(async () => {
      fireEvent.click(modelsButtons[0])
    })

    // Fetch models list
    const fetchModelsBtn = await screen.findByRole('button', { name: 'Fetch Models' })
    await act(async () => {
      fireEvent.click(fetchModelsBtn)
    })

    // Find the 'Add' action for gemini-3-flash-preview
    const addBtns = screen.getAllByRole('button', { name: 'Add' })
    // The first one is typically the fetched model list's "Add" button
    await act(async () => {
      fireEvent.click(addBtns[0])
    })

    expect(toast.success).toHaveBeenCalledWith('Model "gemini-3-flash-preview" added')

    // Click Cancel first to verify it doesn't save
    const cancelBtn = screen.getByRole('button', { name: 'Cancel' })
    await act(async () => {
      fireEvent.click(cancelBtn)
    })

    expect(api.saveLLMProviders).not.toHaveBeenCalled()

    // Open models drawer again
    await act(async () => {
      fireEvent.click(modelsButtons[0])
    })

    // Fetch models again
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Fetch Models' }))
    })

    // Click add again
    const addBtns2 = screen.getAllByRole('button', { name: 'Add' })
    await act(async () => {
      fireEvent.click(addBtns2[0])
    })

    // Now click Save Models
    const saveBtn = screen.getByRole('button', { name: 'Save Models' })
    await act(async () => {
      fireEvent.click(saveBtn)
    })

    // Verify it saved the updated list containing the new model
    expect(api.saveLLMProviders).toHaveBeenCalled()
    const savedArg = vi.mocked(api.saveLLMProviders).mock.calls[0][0]
    const geminiSaved = savedArg.find(p => p.id === 'gemini')
    expect(geminiSaved?.models).toContainEqual({ model_id: 'gemini-3-flash-preview' })
  })
})
