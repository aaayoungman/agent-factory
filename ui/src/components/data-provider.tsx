'use client'
import { useEffect } from 'react'
import { useAppStore } from '@/lib/store'

export function DataProvider({ children }: { children: React.ReactNode }) {
  const connectSSE = useAppStore(s => s.connectSSE)
  const setTabVisible = useAppStore(s => s.setTabVisible)
  const fetchModels = useAppStore(s => s.fetchModels)
  const fetchTemplates = useAppStore(s => s.fetchTemplates)
  const fetchDepartments = useAppStore(s => s.fetchDepartments)
  const fetchAutopilot = useAppStore(s => s.fetchAutopilot)
  const fetchAutopilotDepts = useAppStore(s => s.fetchAutopilotDepts)
  const fetchBudget = useAppStore(s => s.fetchBudget)
  const tabVisible = useAppStore(s => s.tabVisible)

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

  // Autopilot polling — core state every 5s
  useEffect(() => {
    fetchAutopilot()
    const t = setInterval(() => { if (tabVisible) fetchAutopilot() }, 5000)
    return () => clearInterval(t)
  }, [fetchAutopilot, tabVisible])

  // Autopilot departments polling — every 10s
  useEffect(() => {
    fetchAutopilotDepts()
    const t = setInterval(() => { if (tabVisible) fetchAutopilotDepts() }, 10000)
    return () => clearInterval(t)
  }, [fetchAutopilotDepts, tabVisible])

  // Budget polling — every 15s
  useEffect(() => {
    fetchBudget()
    const t = setInterval(() => { if (tabVisible) fetchBudget() }, 15000)
    return () => clearInterval(t)
  }, [fetchBudget, tabVisible])

  return <>{children}</>
}
