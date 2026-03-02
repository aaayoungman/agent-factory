'use client'
import { useState } from 'react'
import { useTranslation } from '@/lib/i18n'
import { X, Check, ArrowLeft, Pencil, Save } from 'lucide-react'

interface IdentityDiffReviewProps {
  oldIdentity: string
  newIdentity: string
  oldSoul: string
  newSoul: string
  onAccept: (identity: string, soul: string) => void
  onCancel: () => void
}

type LineType = 'same' | 'added' | 'removed' | 'modified'

interface DiffLine {
  type: LineType
  oldLine?: string
  newLine?: string
}

function computeDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.split('\n')
  const newLines = newText.split('\n')
  const result: DiffLine[] = []
  const maxLen = Math.max(oldLines.length, newLines.length)

  for (let i = 0; i < maxLen; i++) {
    const oldLine = i < oldLines.length ? oldLines[i] : undefined
    const newLine = i < newLines.length ? newLines[i] : undefined

    if (oldLine === newLine) {
      result.push({ type: 'same', oldLine, newLine })
    } else if (oldLine === undefined) {
      result.push({ type: 'added', newLine })
    } else if (newLine === undefined) {
      result.push({ type: 'removed', oldLine })
    } else {
      result.push({ type: 'modified', oldLine, newLine })
    }
  }

  return result
}

function lineClassName(type: LineType, side: 'old' | 'new'): string {
  switch (type) {
    case 'added':
      return side === 'new' ? 'bg-green-500/10 text-green-400' : ''
    case 'removed':
      return side === 'old' ? 'bg-red-500/10 text-red-400' : ''
    case 'modified':
      return side === 'old'
        ? 'bg-amber-500/10 text-amber-400'
        : 'bg-amber-500/10 text-amber-400'
    default:
      return 'text-muted-foreground'
  }
}

type FileChoice = 'new' | 'old' | 'edit'

function DiffPanel({
  label,
  oldContent,
  newContent,
  choice,
  setChoice,
  editDraft,
  setEditDraft,
  t,
}: {
  label: string
  oldContent: string
  newContent: string
  choice: FileChoice
  setChoice: (c: FileChoice) => void
  editDraft: string
  setEditDraft: (s: string) => void
  t: (k: string) => string
}) {
  const diff = computeDiff(oldContent, newContent)
  const hasChanges = oldContent !== newContent

  return (
    <div className="border border-border rounded-xl overflow-hidden">
      {/* File header */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-muted/30 border-b border-border">
        <span className="text-sm font-medium font-mono">{label}</span>
        {hasChanges && (
          <div className="flex gap-1">
            <button
              onClick={() => setChoice('new')}
              className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                choice === 'new'
                  ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                  : 'bg-muted text-muted-foreground hover:text-foreground'
              }`}
            >
              <Check className="w-3 h-3 inline mr-1" />
              {t('agents.acceptNew')}
            </button>
            <button
              onClick={() => setChoice('old')}
              className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                choice === 'old'
                  ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                  : 'bg-muted text-muted-foreground hover:text-foreground'
              }`}
            >
              <ArrowLeft className="w-3 h-3 inline mr-1" />
              {t('agents.keepOld')}
            </button>
            <button
              onClick={() => { setChoice('edit'); setEditDraft(newContent) }}
              className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                choice === 'edit'
                  ? 'bg-primary/20 text-primary border border-primary/30'
                  : 'bg-muted text-muted-foreground hover:text-foreground'
              }`}
            >
              <Pencil className="w-3 h-3 inline mr-1" />
              {t('agents.editContent')}
            </button>
          </div>
        )}
        {!hasChanges && (
          <span className="text-xs text-muted-foreground">{t('agents.noChanges')}</span>
        )}
      </div>

      {/* Edit mode */}
      {choice === 'edit' ? (
        <textarea
          value={editDraft}
          onChange={e => setEditDraft(e.target.value)}
          rows={16}
          className="w-full bg-muted/10 px-4 py-3 text-xs font-mono text-foreground focus:outline-none resize-y"
        />
      ) : (
        /* Diff view */
        <div className="grid grid-cols-2 divide-x divide-border max-h-[40vh] overflow-y-auto">
          {/* Old side */}
          <div>
            <div className="px-3 py-1.5 text-[10px] font-medium text-muted-foreground bg-muted/20 border-b border-border sticky top-0">
              {t('agents.oldContent')}
            </div>
            <div className="font-mono text-xs">
              {diff.map((line, i) => (
                <div
                  key={i}
                  className={`px-3 py-0.5 min-h-[1.375rem] ${lineClassName(line.type, 'old')}`}
                >
                  {line.type === 'added' ? '\u00A0' : (line.oldLine ?? '')}
                </div>
              ))}
            </div>
          </div>
          {/* New side */}
          <div>
            <div className="px-3 py-1.5 text-[10px] font-medium text-muted-foreground bg-muted/20 border-b border-border sticky top-0">
              {t('agents.newContent')}
            </div>
            <div className="font-mono text-xs">
              {diff.map((line, i) => (
                <div
                  key={i}
                  className={`px-3 py-0.5 min-h-[1.375rem] ${lineClassName(line.type, 'new')}`}
                >
                  {line.type === 'removed' ? '\u00A0' : (line.newLine ?? '')}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export function IdentityDiffReview({
  oldIdentity,
  newIdentity,
  oldSoul,
  newSoul,
  onAccept,
  onCancel,
}: IdentityDiffReviewProps) {
  const { t } = useTranslation()
  const [identityChoice, setIdentityChoice] = useState<FileChoice>('new')
  const [soulChoice, setSoulChoice] = useState<FileChoice>('new')
  const [identityEditDraft, setIdentityEditDraft] = useState(newIdentity)
  const [soulEditDraft, setSoulEditDraft] = useState(newSoul)

  const resolveContent = (choice: FileChoice, oldContent: string, newContent: string, editDraft: string): string => {
    switch (choice) {
      case 'new': return newContent
      case 'old': return oldContent
      case 'edit': return editDraft
    }
  }

  const handleApply = () => {
    onAccept(
      resolveContent(identityChoice, oldIdentity, newIdentity, identityEditDraft),
      resolveContent(soulChoice, oldSoul, newSoul, soulEditDraft),
    )
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div
        className="bg-card border border-border rounded-xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold">{t('agents.identityDiffTitle')}</h2>
          <button onClick={onCancel} className="p-1 text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          <DiffPanel
            label="IDENTITY.md"
            oldContent={oldIdentity}
            newContent={newIdentity}
            choice={identityChoice}
            setChoice={setIdentityChoice}
            editDraft={identityEditDraft}
            setEditDraft={setIdentityEditDraft}
            t={t}
          />
          <DiffPanel
            label="SOUL.md"
            oldContent={oldSoul}
            newContent={newSoul}
            choice={soulChoice}
            setChoice={setSoulChoice}
            editDraft={soulEditDraft}
            setEditDraft={setSoulEditDraft}
            t={t}
          />
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-border">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-muted"
          >
            {t('agents.discardChanges')}
          </button>
          <button
            onClick={handleApply}
            className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 flex items-center gap-1.5"
          >
            <Save className="w-3.5 h-3.5" />
            {t('agents.applyChanges')}
          </button>
        </div>
      </div>
    </div>
  )
}
