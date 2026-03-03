'use client'
import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Play, Square, RotateCw, Users, ChevronDown, ChevronUp, Send, FileText } from 'lucide-react'

interface DeptInfo {
  id: string
  name: string
  head: string
  enabled: boolean
  interval: number
  directives?: string[]
  report?: string
  state: {
    status: string
    cycleCount: number
    lastCycleAt?: string
    lastCycleResult?: string
    tokensUsedToday?: number
  }
}

const deptStatusConfig: Record<string, { label: string; color: string }> = {
  running: { label: 'Running', color: 'bg-emerald-400/10 text-emerald-400 border-emerald-400/20' },
  idle: { label: 'Idle', color: 'bg-blue-400/10 text-blue-400 border-blue-400/20' },
  stopped: { label: 'Stopped', color: 'bg-gray-400/10 text-gray-400 border-gray-400/20' },
  cycling: { label: 'Cycling', color: 'bg-yellow-400/10 text-yellow-400 border-yellow-400/20' },
  error: { label: 'Error', color: 'bg-red-400/10 text-red-400 border-red-400/20' },
}

export function DepartmentLoopCard({ dept, sendAction, loading, onRefresh }: {
  dept: DeptInfo
  sendAction: (action: string, extra?: Record<string, unknown>) => void
  loading: boolean
  onRefresh: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [directiveText, setDirectiveText] = useState('')
  const [saving, setSaving] = useState(false)
  const [showReport, setShowReport] = useState(false)

  const sc = deptStatusConfig[dept.state.status] || deptStatusConfig.stopped
  const isRunning = dept.state.status === 'running' || dept.state.status === 'cycling'
  const hasDirectives = dept.directives && dept.directives.length > 0

  const saveDirectives = async () => {
    if (!directiveText.trim()) return
    setSaving(true)
    try {
      // Split by newlines for multiple directives, or keep as single
      const lines = directiveText.split('\n').map(l => l.trim()).filter(Boolean)
      const existing = dept.directives || []
      await fetch('/api/autopilot/departments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deptId: dept.id, directives: [...existing, ...lines] }),
      })
      setDirectiveText('')
      onRefresh()
    } catch {} finally {
      setSaving(false)
    }
  }

  const clearDirectives = async () => {
    setSaving(true)
    try {
      await fetch('/api/autopilot/departments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deptId: dept.id, directives: [] }),
      })
      onRefresh()
    } catch {} finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-muted/30 rounded-lg p-3 space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs font-medium">{dept.name || dept.id}</span>
          {hasDirectives && (
            <Badge className="text-[8px] px-1 py-0 bg-amber-500/10 text-amber-400 border-amber-500/20">
              {dept.directives!.length} directive{dept.directives!.length > 1 ? 's' : ''}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <Badge className={`text-[10px] ${sc.color}`}>{sc.label}</Badge>
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-muted-foreground hover:text-foreground transition-colors p-0.5"
          >
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Info */}
      <div className="grid grid-cols-3 gap-2 text-center text-[10px]">
        <div>
          <div className="font-bold text-sm">{dept.state.cycleCount}</div>
          <div className="text-muted-foreground">Cycles</div>
        </div>
        <div>
          <div className="font-bold text-sm">{Math.round(dept.interval / 60)}m</div>
          <div className="text-muted-foreground">Interval</div>
        </div>
        <div>
          <div className="font-bold text-sm">
            {(dept.state.tokensUsedToday || 0) > 1000
              ? `${((dept.state.tokensUsedToday || 0) / 1000).toFixed(0)}k`
              : dept.state.tokensUsedToday || 0}
          </div>
          <div className="text-muted-foreground">Tokens Today</div>
        </div>
      </div>

      {/* Last result */}
      {dept.state.lastCycleResult && (
        <p className="text-[10px] text-muted-foreground line-clamp-2">{dept.state.lastCycleResult}</p>
      )}

      {/* Controls */}
      <div className="flex items-center gap-1.5">
        {isRunning ? (
          <button
            onClick={() => sendAction('stop-dept', { deptId: dept.id })}
            disabled={loading}
            className="flex items-center gap-1 px-2 py-1 bg-red-500/10 text-red-400 border border-red-500/20 rounded text-[10px] font-medium hover:bg-red-500/20 transition-colors disabled:opacity-50"
          >
            <Square className="w-2.5 h-2.5" /> Stop
          </button>
        ) : (
          <button
            onClick={() => sendAction('start-dept', { deptId: dept.id, interval: dept.interval })}
            disabled={loading}
            className="flex items-center gap-1 px-2 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded text-[10px] font-medium hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
          >
            <Play className="w-2.5 h-2.5" /> Start
          </button>
        )}
        <button
          onClick={() => sendAction('dept-cycle', { deptId: dept.id })}
          disabled={loading || dept.state.status === 'cycling'}
          className="flex items-center gap-1 px-2 py-1 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded text-[10px] font-medium hover:bg-blue-500/20 transition-colors disabled:opacity-50"
        >
          <RotateCw className={`w-2.5 h-2.5 ${dept.state.status === 'cycling' ? 'animate-spin' : ''}`} /> Cycle
        </button>
        {dept.report && (
          <button
            onClick={() => setShowReport(!showReport)}
            className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-colors ${
              showReport
                ? 'bg-primary/10 text-primary border border-primary/20'
                : 'bg-muted/50 text-muted-foreground hover:text-foreground border border-transparent'
            }`}
          >
            <FileText className="w-2.5 h-2.5" /> Report
          </button>
        )}
        <span className="text-[9px] text-muted-foreground ml-auto">head: {dept.head}</span>
      </div>

      {/* Report */}
      {showReport && dept.report && (
        <div className="bg-muted/50 rounded-md p-2.5 text-[10px] leading-relaxed whitespace-pre-wrap max-h-48 overflow-y-auto border border-muted">
          {dept.report}
        </div>
      )}

      {/* Expanded: Directives Panel */}
      {expanded && (
        <div className="space-y-2 pt-1 border-t border-muted">
          <span className="text-[10px] text-muted-foreground font-medium">CEO Directives</span>

          {/* Current directives */}
          {hasDirectives && (
            <div className="space-y-1">
              {dept.directives!.map((d, i) => (
                <div key={i} className="flex items-start gap-1.5 bg-amber-500/5 border border-amber-500/10 rounded px-2 py-1.5">
                  <span className="text-amber-400 text-[10px] mt-0.5 shrink-0">#{i + 1}</span>
                  <span className="text-[10px] leading-relaxed">{d}</span>
                </div>
              ))}
              <button
                onClick={clearDirectives}
                disabled={saving}
                className="text-[9px] text-red-400 hover:text-red-300 transition-colors disabled:opacity-50"
              >
                Clear all directives
              </button>
            </div>
          )}

          {/* New directive input */}
          <div className="flex gap-1.5">
            <textarea
              value={directiveText}
              onChange={e => setDirectiveText(e.target.value)}
              placeholder="输入方向指令，如：创作玄幻题材，目标番茄小说平台，50万字长篇..."
              className="flex-1 bg-background border border-muted rounded px-2 py-1.5 text-[11px] leading-relaxed resize-none placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/30"
              rows={2}
              onKeyDown={e => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault()
                  saveDirectives()
                }
              }}
            />
            <button
              onClick={saveDirectives}
              disabled={saving || !directiveText.trim()}
              className="self-end flex items-center gap-1 px-2.5 py-1.5 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded text-[10px] font-medium hover:bg-amber-500/20 transition-colors disabled:opacity-50"
            >
              <Send className="w-2.5 h-2.5" />
            </button>
          </div>
          <p className="text-[9px] text-muted-foreground">
            Directives are sent to the department head at the start of each cycle. Cmd+Enter to send.
          </p>
        </div>
      )}
    </div>
  )
}
