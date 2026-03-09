'use client'
import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Play, Square, RotateCw, Users, ChevronDown, ChevronUp, Send, FileText } from 'lucide-react'
import { useTranslation } from '@/lib/i18n'
import { getDeptStatusConfig } from '@/lib/autopilot-shared'
import type { DeptInfo } from '@/lib/autopilot-shared'

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return '<1m'
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  return `${days}d`
}

export function DepartmentLoopCard({ dept, sendAction, loading, onRefresh }: {
  dept: DeptInfo
  sendAction: (action: string, extra?: Record<string, unknown>) => void
  loading: boolean
  onRefresh: () => void
}) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const [directiveText, setDirectiveText] = useState('')
  const [missionText, setMissionText] = useState(dept.mission || '')
  const [saving, setSaving] = useState(false)
  const [missionSaving, setMissionSaving] = useState(false)
  const [missionSaved, setMissionSaved] = useState(false)
  const [showReport, setShowReport] = useState(false)
  const [error, setError] = useState('')

  const deptStatusConfig = getDeptStatusConfig(t)
  const sc = deptStatusConfig[dept.state.status] || deptStatusConfig.stopped
  const isRunning = dept.state.status === 'running' || dept.state.status === 'cycling'
  const hasDirectives = dept.directives && dept.directives.length > 0
  const headMissing = dept.headExists === false

  const saveDirectives = async () => {
    if (!directiveText.trim()) return
    setSaving(true)
    setError('')
    try {
      const lines = directiveText.split('\n').map(l => l.trim()).filter(Boolean)
      const existing = dept.directives || []
      const res = await fetch('/api/autopilot/departments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deptId: dept.id, directives: [...existing, ...lines] }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        setError(data.error || t('autopilot.error.actionFailed'))
        return
      }
      setDirectiveText('')
      onRefresh()
    } catch (e) {
      setError(String(e))
    } finally {
      setSaving(false)
    }
  }

  const clearDirectives = async () => {
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/autopilot/departments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deptId: dept.id, directives: [] }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        setError(data.error || t('autopilot.error.actionFailed'))
        return
      }
      onRefresh()
    } catch (e) {
      setError(String(e))
    } finally {
      setSaving(false)
    }
  }

  const saveMission = async () => {
    setMissionSaving(true)
    setError('')
    try {
      const res = await fetch('/api/autopilot/departments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deptId: dept.id, mission: missionText }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        setError(data.error || t('autopilot.error.actionFailed'))
        return
      }
      setMissionSaved(true)
      setTimeout(() => setMissionSaved(false), 2000)
      onRefresh()
    } catch (e) {
      setError(String(e))
    } finally {
      setMissionSaving(false)
    }
  }

  return (
    <div className="bg-muted/30 rounded-lg p-4 space-y-3 border border-muted/50">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-muted-foreground shrink-0" />
            <span className="text-sm font-semibold truncate">{dept.name || dept.id}</span>
            {hasDirectives && (
              <Badge className="text-[9px] px-1.5 py-0 bg-amber-500/10 text-amber-400 border-amber-500/20">
                {dept.directives!.length} directive{dept.directives!.length > 1 ? 's' : ''}
              </Badge>
            )}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">{t('autopilot.dept.head')}: {dept.head || '—'}</div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Badge className={`text-xs ${sc.color}`}>{sc.label}</Badge>
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-muted-foreground hover:text-foreground transition-colors p-1"
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded px-2.5 py-1.5">
          {error}
        </div>
      )}

      {/* Stats grid */}
      <div className="grid grid-cols-4 gap-2 text-center">
        <div>
          <div className="font-bold text-base">{dept.state.cycleCount}</div>
          <div className="text-xs text-muted-foreground">{t('autopilot.dept.cycles')}</div>
        </div>
        <div>
          <div className="font-bold text-base">{Math.round(dept.interval / 60)}m</div>
          <div className="text-xs text-muted-foreground">{t('autopilot.dept.interval')}</div>
        </div>
        <div>
          <div className="font-bold text-base">
            {(dept.state.tokensUsedToday || 0) > 1000
              ? `${((dept.state.tokensUsedToday || 0) / 1000).toFixed(0)}k`
              : dept.state.tokensUsedToday || 0}
          </div>
          <div className="text-xs text-muted-foreground">{t('autopilot.dept.tokensToday')}</div>
        </div>
        <div>
          <div className="font-bold text-base">
            {dept.state.lastCycleAt ? timeAgo(dept.state.lastCycleAt) : '—'}
          </div>
          <div className="text-xs text-muted-foreground">{t('autopilot.dept.lastRun')}</div>
        </div>
      </div>

      {/* Last result */}
      {dept.state.lastCycleResult && (
        <p className="text-xs text-muted-foreground line-clamp-3">{dept.state.lastCycleResult}</p>
      )}

      {/* Head missing warning */}
      {headMissing && (
        <div className="text-xs text-amber-400 bg-amber-500/5 border border-amber-500/10 rounded px-2.5 py-1.5">
          {t('autopilot.dept.headMissing').replace('{head}', dept.head || '—')}
        </div>
      )}

      {/* Controls */}
      <div className="flex items-center gap-2 flex-wrap">
        {isRunning ? (
          <button
            onClick={() => sendAction('stop-dept', { deptId: dept.id })}
            disabled={loading}
            title={t('autopilot.dept.stopTip')}
            className="flex items-center gap-1 px-2.5 py-1.5 bg-red-500/10 text-red-400 border border-red-500/20 rounded text-xs font-medium hover:bg-red-500/20 transition-colors disabled:opacity-50"
          >
            <Square className="w-3 h-3" /> {t('autopilot.dept.stop')}
          </button>
        ) : (
          <button
            onClick={() => sendAction('start-dept', { deptId: dept.id, interval: dept.interval })}
            disabled={loading || headMissing}
            title={headMissing ? t('autopilot.dept.headMissing').replace('{head}', dept.head || '—') : t('autopilot.dept.startTip').replace('{head}', dept.head || dept.id)}
            className="flex items-center gap-1 px-2.5 py-1.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded text-xs font-medium hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
          >
            <Play className="w-3 h-3" /> {t('autopilot.dept.start')}
          </button>
        )}
        <button
          onClick={() => sendAction('dept-cycle', { deptId: dept.id })}
          disabled={loading || dept.state.status === 'cycling' || headMissing}
          title={headMissing ? t('autopilot.dept.headMissing').replace('{head}', dept.head || '—') : t('autopilot.dept.cycleTip').replace('{head}', dept.head || dept.id)}
          className="flex items-center gap-1 px-2.5 py-1.5 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded text-xs font-medium hover:bg-blue-500/20 transition-colors disabled:opacity-50"
        >
          <RotateCw className={`w-3 h-3 ${dept.state.status === 'cycling' ? 'animate-spin' : ''}`} /> {t('autopilot.dept.cycle')}
        </button>
        {dept.report && (
          <button
            onClick={() => setShowReport(!showReport)}
            title={t('autopilot.dept.reportTip')}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded text-xs font-medium transition-colors ${
              showReport
                ? 'bg-primary/10 text-primary border border-primary/20'
                : 'bg-muted/50 text-muted-foreground hover:text-foreground border border-transparent'
            }`}
          >
            <FileText className="w-3 h-3" /> {t('autopilot.dept.report')}
          </button>
        )}
      </div>

      {/* Report */}
      {showReport && dept.report && (
        <div className="bg-muted/50 rounded-md p-3 text-xs leading-relaxed whitespace-pre-wrap max-h-48 overflow-y-auto border border-muted">
          {dept.report}
        </div>
      )}

      {/* Expanded: Mission + Directives Panel */}
      {expanded && (
        <div className="space-y-3 pt-2 border-t border-muted">
          {/* Department Mission */}
          <div className="space-y-2">
            <span className="text-xs text-muted-foreground font-medium">{t('autopilot.dept.mission')}</span>
            <textarea
              value={missionText}
              onChange={e => setMissionText(e.target.value)}
              placeholder={t('autopilot.dept.missionPlaceholder')}
              className="w-full bg-background border border-muted rounded px-2.5 py-2 text-xs leading-relaxed resize-none placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/30"
              rows={3}
            />
            <div className="flex items-center gap-2">
              <button
                onClick={saveMission}
                disabled={missionSaving}
                className="px-3 py-1.5 bg-primary/10 text-primary border border-primary/20 rounded text-xs font-medium hover:bg-primary/20 transition-colors disabled:opacity-50"
              >
                {missionSaving ? t('common.saving') : t('common.save')}
              </button>
              {missionSaved && (
                <span className="text-xs text-emerald-400">{t('autopilot.dept.missionSaved')}</span>
              )}
            </div>
          </div>

          {/* CEO Directives */}
          <div className="space-y-2">
            <span className="text-xs text-muted-foreground font-medium">{t('autopilot.dept.ceoDirectives')}</span>

            {/* Current directives */}
            {hasDirectives && (
              <div className="space-y-1">
                {dept.directives!.map((d, i) => (
                  <div key={i} className="flex items-start gap-1.5 bg-amber-500/5 border border-amber-500/10 rounded px-2.5 py-2">
                    <span className="text-amber-400 text-xs mt-0.5 shrink-0">#{i + 1}</span>
                    <span className="text-xs leading-relaxed">{d}</span>
                  </div>
                ))}
                <button
                  onClick={clearDirectives}
                  disabled={saving}
                  className="text-xs text-red-400 hover:text-red-300 transition-colors disabled:opacity-50"
                >
                  {t('autopilot.dept.clearAll')}
                </button>
              </div>
            )}

            {/* New directive input */}
            <div className="flex gap-1.5">
              <textarea
                value={directiveText}
                onChange={e => setDirectiveText(e.target.value)}
                placeholder={t('autopilot.dept.directivePlaceholder')}
                className="flex-1 bg-background border border-muted rounded px-2.5 py-2 text-xs leading-relaxed resize-none placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/30"
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
                className="self-end flex items-center gap-1 px-3 py-2 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded text-xs font-medium hover:bg-amber-500/20 transition-colors disabled:opacity-50"
              >
                <Send className="w-3 h-3" />
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              {t('autopilot.dept.directiveHint')}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
