'use client'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/lib/i18n'

const phaseKeys = ['phases.research', 'phases.design', 'phases.develop', 'phases.test', 'phases.deploy']

export function PhaseProgress({ current, total }: { current: number; total: number }) {
  const { t } = useTranslation()
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: total }, (_, i) => {
        const phase = i + 1
        const done = phase < current
        const active = phase === current
        return (
          <div key={i} className="flex-1 flex flex-col items-center gap-1">
            <div className={cn(
              'w-full h-2 rounded-full transition-colors',
              done ? 'bg-emerald-500' : active ? 'bg-primary animate-pulse' : 'bg-muted'
            )} />
            <span className={cn(
              'text-[10px]',
              done ? 'text-emerald-400' : active ? 'text-primary' : 'text-muted-foreground'
            )}>
              {phaseKeys[i] ? t(phaseKeys[i]) : `P${phase}`}
            </span>
          </div>
        )
      })}
    </div>
  )
}
