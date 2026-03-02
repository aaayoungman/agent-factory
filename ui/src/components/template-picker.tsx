'use client'
import { useState } from 'react'
import { AgentTemplate, Department } from '@/lib/types'
import { useTranslation } from '@/lib/i18n'
import { useAppStore } from '@/lib/store'
import { Plus, ChevronDown, ChevronRight } from 'lucide-react'

interface TemplatePickerProps {
  templates: AgentTemplate[]
  onSelect: (template: AgentTemplate | null) => void
}

export function TemplatePicker({ templates, onSelect }: TemplatePickerProps) {
  const { t, locale } = useTranslation()
  const departments = useAppStore(s => s.departments)

  // Build department lookup
  const deptMap = new Map<string, Department>()
  for (const d of departments) deptMap.set(d.id, d)

  // Group builtin templates by group field
  const builtin = templates.filter(t => t.category === 'builtin')
  const custom = templates.filter(t => t.category === 'custom')

  const groupedBuiltin: Record<string, AgentTemplate[]> = {}
  for (const tmpl of builtin) {
    const g = tmpl.group || 'other'
    if (!groupedBuiltin[g]) groupedBuiltin[g] = []
    groupedBuiltin[g].push(tmpl)
  }

  const sortedGroups = Object.keys(groupedBuiltin).sort((a, b) => {
    const orderA = deptMap.get(a)?.order ?? 999
    const orderB = deptMap.get(b)?.order ?? 999
    return orderA - orderB
  })

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const toggleGroup = (g: string) => {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(g)) next.delete(g)
      else next.add(g)
      return next
    })
  }

  const getGroupLabel = (groupId: string): { emoji: string; label: string } => {
    const dept = deptMap.get(groupId)
    if (dept) {
      return { emoji: dept.emoji, label: locale === 'zh' ? dept.name : dept.nameEn }
    }
    // Fallback for 'other' or unknown groups
    return { emoji: '🤖', label: t('agents.groupOther') }
  }

  return (
    <div className="space-y-4">
      {sortedGroups.map(groupId => {
        const { emoji, label } = getGroupLabel(groupId)
        const items = groupedBuiltin[groupId]
        const isCollapsed = collapsed.has(groupId)

        return (
          <div key={groupId}>
            <button
              onClick={() => toggleGroup(groupId)}
              className="flex items-center gap-2 w-full text-left text-sm font-medium text-muted-foreground hover:text-foreground transition-colors mb-2"
            >
              {isCollapsed
                ? <ChevronRight className="w-4 h-4 shrink-0" />
                : <ChevronDown className="w-4 h-4 shrink-0" />
              }
              <span>{emoji}</span>
              <span>{label}</span>
              <span className="text-xs text-muted-foreground ml-1">({items.length})</span>
            </button>
            {!isCollapsed && (
              <div className="grid grid-cols-2 gap-2">
                {items.map(tmpl => (
                  <button
                    key={tmpl.id}
                    onClick={() => onSelect(tmpl)}
                    className="flex items-center gap-2.5 p-3 rounded-lg border border-border hover:border-primary/50 hover:bg-primary/5 transition-colors text-left"
                  >
                    <span className="text-2xl shrink-0">{tmpl.emoji}</span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-medium truncate">{tmpl.name}</span>
                        <span className="text-[10px] font-mono text-muted-foreground shrink-0">({tmpl.id})</span>
                      </div>
                      {tmpl.description && (
                        <span className="text-[10px] text-muted-foreground block truncate">{tmpl.description}</span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )
      })}

      {custom.length > 0 && (
        <>
          <h4 className="text-sm font-medium text-muted-foreground">{t('templates.customTitle')}</h4>
          <div className="grid grid-cols-2 gap-2">
            {custom.map(tmpl => (
              <button
                key={tmpl.id}
                onClick={() => onSelect(tmpl)}
                className="flex items-center gap-2.5 p-3 rounded-lg border border-border hover:border-primary/50 hover:bg-primary/5 transition-colors text-left"
              >
                <span className="text-2xl shrink-0">{tmpl.emoji}</span>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-medium truncate">{tmpl.name}</span>
                    <span className="text-[10px] font-mono text-muted-foreground shrink-0">({tmpl.id})</span>
                  </div>
                  {tmpl.description && (
                    <span className="text-[10px] text-muted-foreground block truncate">{tmpl.description}</span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      <button
        onClick={() => onSelect(null)}
        className="flex flex-col items-center gap-1.5 p-3 rounded-lg border border-dashed border-border hover:border-primary/50 hover:bg-primary/5 transition-colors w-full"
      >
        <Plus className="w-6 h-6 text-muted-foreground" />
        <span className="text-xs font-medium">{t('templates.blankAgent')}</span>
      </button>
    </div>
  )
}
