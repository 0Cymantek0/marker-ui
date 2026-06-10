import { useEffect, useState } from 'react'
import { Routes, Route } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { ConvertPage } from '@/pages/ConvertPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { HistoryPage } from '@/pages/HistoryPage'
import { OnboardingPage } from '@/pages/OnboardingPage'
import { getModelsStatus } from '@/lib/api'
import { Loader2, Database } from 'lucide-react'

export default function App() {
  const [initialized, setInitialized] = useState<boolean | null>(null)

  useEffect(() => {
    let active = true
    const checkInit = async () => {
      try {
        const data = await getModelsStatus()
        if (active) {
          if (data.initialized || data.overall.status === 'completed') {
            setInitialized(true)
          } else {
            setInitialized(false)
          }
        }
      } catch (err) {
        console.error('Failed to check initialization status:', err)
        if (active) {
          setInitialized(false)
        }
      }
    }

    checkInit()
    return () => {
      active = false
    }
  }, [])

  if (initialized === null) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950 text-slate-100 p-6">
        <div className="p-3 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-2xl shadow-lg mb-4 animate-pulse">
          <Database className="h-8 w-8 text-white" />
        </div>
        <Loader2 className="h-6 w-6 text-indigo-500 animate-spin mb-2" />
        <p className="text-slate-400 text-sm font-medium">Checking engine status...</p>
      </div>
    )
  }

  if (!initialized) {
    return <OnboardingPage onComplete={() => setInitialized(true)} />
  }

  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<ConvertPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/history" element={<HistoryPage />} />
      </Route>
    </Routes>
  )
}
