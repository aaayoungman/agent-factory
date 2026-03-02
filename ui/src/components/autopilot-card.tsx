'use client'
import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Play, Square, RotateCw, Rocket, Clock, Zap } from 'lucide-react'
import { timeAgo } from '@/lib/utils'

interface AutopilotState {
  status: 'running' | 'stopped' | 'cycling' | 'error'
  pid: number | null
  cycleCount: number
  lastCycleAt: string | null
  lastCycleResult: string | null
  intervalSeconds: number
  missionSummary: string
  recentHistory: Array<{
    cycle: number
    startedAt: string
    completedAt: string
    elapsedSec: number
    result: string
    tokens: number
  }>
}

const statusConfig: Record<string, { label: string; color: string }> = {
  running: { label: '🟢 Running', color: 'bg-emerald-400/10 text-emerald-400 border-emerald-400/20' },
  stopped: { label: '⏹ Stopped', color: 'bg-gray-400/10 text-gray-400 border-gray-400/20' },
  cycling: { label: '🔄 Cycling', color: 'bg-blue-400/10 text-blue-400 border-blue-400/20' },
  error: { label: '❌ Error', color: 'bg-red-400/10 text-red-400 border-red-400/20' },
}

export function AutopilotCard() {
  const [state, setState] = useState<AutopilotState | null>(null)
  const [loading, setLoading] = useState(false)
  const [countdown, setCountdown] = useState('')

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/autopilot')
      if (res.ok) setState(await res.json())
    } catch {}
  }, [])

  useEffect(() => {
    fetchStatus()
    const t = setInterval(fetchStatus, 5000)
    return () => clearInterval(t)
  }, [fetchStatus])

  // Countdown to next cycle
  useEffect(() => {
    if (!state || state.status !== 'running' || !state.lastCycleAt) {
      setCountdown('')
      return
    }
    const update = () => {
      const nextAt = new Date(state.lastCycleAt!).getTime() + state.intervalSeconds * 1000
      const remaining = Math.max(0, nextAt - Date.now())
      if (remaining <= 0) {
        setCountdown('soon...')
        return
      }
      const mins = Math.floor(remaining / 60000)
      const secs = Math.floor((remaining % 60000) / 1000)
      setCountdown(`${mins}:${secs.toString().padStart(2, '0')}`)
    }
    update()
    const t = setInterval(update, 1000)
    return () => clearInterval(t)
  }, [state?.status, state?.lastCycleAt, state?.intervalSeconds])

  const sendAction = async (action: string, interval?: number) => {
    setLoading(true)
    try {
      await fetch('/api/autopilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, interval }),
      })
      // Wait a bit then refresh
      setTimeout(fetchStatus, 1500)
    } catch {} finally {
      setLoading(false)
    }
  }

  if (!state) return null

  const sc = statusConfig[state.status] || statusConfig.stopped

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Rocket className="w-4 h-4" /> Autopilot
          </CardTitle>
          <Badge className={sc.color}>{sc.label}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Controls */}
        <div className="flex items-center gap-2">
          {state.status === 'running' ? (
            <button
              onClick={() => sendAction('stop')}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 text-red-400 border border-red-500/20 rounded-md text-xs font-medium hover:bg-red-500/20 transition-colors disabled:opacity-50"
            >
              <Square className="w-3 h-3" /> Stop
            </button>
          ) : (
            <button
              onClick={() => sendAction('start', 1800)}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-md text-xs font-medium hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
            >
              <Play className="w-3 h-3" /> Start Loop
            </button>
          )}
          <button
            onClick={() => sendAction('cycle')}
            disabled={loading || state.status === 'cycling'}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-md text-xs font-medium hover:bg-blue-500/20 transition-colors disabled:opacity-50"
          >
            <RotateCw className={`w-3 h-3 ${state.status === 'cycling' ? 'animate-spin' : ''}`} /> Run Cycle
          </button>
        </div>

        {/* Next cycle countdown */}
        {state.status === 'running' && countdown && (
          <div className="flex items-center justify-between bg-primary/5 border border-primary/10 rounded-lg px-3 py-2">
            <span className="text-xs text-muted-foreground">Next Cycle</span>
            <span className="text-sm font-mono font-bold text-primary">{countdown}</span>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="bg-muted/50 rounded-lg p-2">
            <div className="text-lg font-bold">{state.cycleCount}</div>
            <div className="text-[10px] text-muted-foreground">Cycles</div>
          </div>
          <div className="bg-muted/50 rounded-lg p-2">
            <div className="text-lg font-bold flex items-center justify-center gap-1">
              <Clock className="w-3 h-3" />
              {state.intervalSeconds >= 3600
                ? `${(state.intervalSeconds / 3600).toFixed(0)}h`
                : `${(state.intervalSeconds / 60).toFixed(0)}m`}
            </div>
            <div className="text-[10px] text-muted-foreground">Interval</div>
          </div>
          <div className="bg-muted/50 rounded-lg p-2">
            <div className="text-lg font-bold flex items-center justify-center gap-1">
              <Zap className="w-3 h-3" />
              {state.recentHistory.reduce((s, h) => s + h.tokens, 0) > 1000
                ? `${(state.recentHistory.reduce((s, h) => s + h.tokens, 0) / 1000).toFixed(0)}k`
                : state.recentHistory.reduce((s, h) => s + h.tokens, 0)}
            </div>
            <div className="text-[10px] text-muted-foreground">Tokens</div>
          </div>
        </div>

        {/* Last cycle result */}
        {state.lastCycleResult && (
          <div className="bg-muted/30 rounded-lg p-3 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground font-medium">Last Cycle</span>
              {state.lastCycleAt && (
                <span className="text-[10px] text-muted-foreground">{timeAgo(state.lastCycleAt)}</span>
              )}
            </div>
            <p className="text-xs leading-relaxed line-clamp-4">{state.lastCycleResult}</p>
          </div>
        )}

        {/* Recent history */}
        {state.recentHistory.length > 0 && (
          <div className="space-y-1.5">
            <span className="text-[10px] text-muted-foreground font-medium">History</span>
            {state.recentHistory.slice(-5).reverse().map(h => (
              <div key={h.cycle} className="flex items-center gap-2 text-[10px]">
                <span className="text-muted-foreground font-mono w-6">#{h.cycle}</span>
                <span className="text-muted-foreground">{h.elapsedSec}s</span>
                <span className="text-muted-foreground">{h.tokens > 0 ? `${(h.tokens/1000).toFixed(1)}k` : '-'}</span>
                <span className="flex-1 truncate">{h.result}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
