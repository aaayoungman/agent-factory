'use client'
import { useEffect } from 'react'
import { useAppStore } from '@/lib/store'

export function DataProvider({ children }: { children: React.ReactNode }) {
  const connectSSE = useAppStore(s => s.connectSSE)
  const setTabVisible = useAppStore(s => s.setTabVisible)
  const fetchModels = useAppStore(s => s.fetchModels)
  const fetchTemplates = useAppStore(s => s.fetchTemplates)
  const fetchDepartments = useAppStore(s => s.fetchDepartments)

  // SSE connection
  useEffect(() => {
    const disconnect = connectSSE()
    return disconnect
  }, [connectSSE])

  // One-time data (not pushed via SSE)
  useEffect(() => {
    fetchModels()
    fetchTemplates()
    fetchDepartments()
  }, [fetchModels, fetchTemplates, fetchDepartments])

  // Tab visibility tracking
  useEffect(() => {
    const handler = () => setTabVisible(document.visibilityState === 'visible')
    document.addEventListener('visibilitychange', handler)
    return () => document.removeEventListener('visibilitychange', handler)
  }, [setTabVisible])

  return <>{children}</>
}
