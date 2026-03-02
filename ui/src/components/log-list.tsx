'use client'
import { useState, useEffect } from 'react'
import { LogEntry } from '@/lib/types'
import { cn } from '@/lib/utils'

const levelColors = {
  info: 'text-blue-400',
  warn: 'text-amber-400',
  error: 'text-red-400',
  debug: 'text-gray-500',
}

const levelBg = {
  info: 'bg-blue-400/10',
  warn: 'bg-amber-400/10',
  error: 'bg-red-400/10',
  debug: 'bg-gray-500/10',
}

export function LogList({ logs, maxItems = 20 }: { logs: LogEntry[]; maxItems?: number }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  return (
    <div className="space-y-1 font-mono text-xs">
      {logs.slice(0, maxItems).map((log) => (
        <div key={log.id} className={cn('flex items-start gap-2 px-3 py-1.5 rounded', levelBg[log.level])}>
          <span className="text-muted-foreground whitespace-nowrap">
            {mounted ? new Date(log.timestamp).toLocaleTimeString('zh-CN', { hour12: false }) : '--:--:--'}
          </span>
          <span className={cn('uppercase w-12 shrink-0 font-bold', levelColors[log.level])}>
            {log.level}
          </span>
          <span className="text-primary/70 w-20 shrink-0 truncate">[{log.agent}]</span>
          <span className="text-foreground/90 break-all">{log.message}</span>
        </div>
      ))}
    </div>
  )
}
