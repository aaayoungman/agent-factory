'use client'
import type { Agent } from '@/lib/types'
import { useTranslation } from '@/lib/i18n'
import { CharacterState } from './pixel-types'
import type { CharacterState as CharacterStateType } from './pixel-types'

interface AgentTooltipProps {
  agent: Agent | undefined
  screenX: number
  screenY: number
  visible: boolean
  characterState?: CharacterStateType
}

function getStateLabel(t: (key: string) => string, state?: CharacterStateType, agent?: Agent): string | null {
  if (!state) return null
  switch (state) {
    case CharacterState.TYPE:
      if (agent?.currentTool) return t('pixelOffice.using').replace('{tool}', agent.currentTool)
      return t('pixelOffice.working')
    case CharacterState.MEET: return t('pixelOffice.inMeeting')
    case CharacterState.DRINK: return t('pixelOffice.coffeeBreak')
    case CharacterState.SLEEP: return t('pixelOffice.sleeping')
    case CharacterState.ERROR: return t('pixelOffice.error')
    case CharacterState.WALK: return t('pixelOffice.walking')
    case CharacterState.IDLE: return t('pixelOffice.idle')
    default: return null
  }
}

export function AgentTooltip({ agent, screenX, screenY, visible, characterState }: AgentTooltipProps) {
  const { t } = useTranslation()
  if (!visible || !agent) return null

  const stateLabel = getStateLabel(t, characterState, agent)

  return (
    <div
      className="absolute z-50 pointer-events-none px-3 py-2 rounded-lg border border-border bg-popover text-popover-foreground shadow-lg text-sm"
      style={{
        left: screenX + 12,
        top: screenY - 8,
        maxWidth: 220,
      }}
    >
      <div className="font-medium">{agent.name}</div>
      <div className="flex items-center gap-1.5 mt-0.5 text-xs text-muted-foreground">
        <span
          className={`inline-block w-2 h-2 rounded-full ${
            agent.status === 'busy' ? 'bg-amber-400' : 'bg-emerald-400'
          }`}
        />
        {stateLabel || (agent.status === 'busy' ? t('common.busy') : t('common.online'))}
      </div>
      {agent.role && (
        <div className="text-xs text-muted-foreground mt-0.5">{agent.role}</div>
      )}
    </div>
  )
}
