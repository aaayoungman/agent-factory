/**
 * base-rules.ts — 解析 config/base-rules.md 并注入到 Agent 的 AGENTS.md / SOUL.md
 *
 * 三段标记：
 *   ## AGENTS_RULES  → 注入 AGENTS.md 头部
 *   ## SOUL_RULES    → 注入 SOUL.md 头部
 *   ## REMINDER      → 注入 AGENTS.md 尾部
 *
 * 注入使用 HTML 注释 marker 包裹，支持幂等更新。
 */

import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'

const PROJECT_ROOT = resolve(process.cwd(), '..')
const BASE_RULES_PATH = join(PROJECT_ROOT, 'config', 'base-rules.md')

// ── Marker constants ──────────────────────────────────────────

const AGENTS_BEGIN = '<!-- BASE-RULES:BEGIN -->'
const AGENTS_END = '<!-- BASE-RULES:END -->'
const REMINDER_BEGIN = '<!-- BASE-RULES-REMINDER:BEGIN -->'
const REMINDER_END = '<!-- BASE-RULES-REMINDER:END -->'
const SOUL_BEGIN = '<!-- BASE-SOUL:BEGIN -->'
const SOUL_END = '<!-- BASE-SOUL:END -->'

// ── Types ─────────────────────────────────────────────────────

export interface BaseRules {
  agentsRules: string
  soulRules: string
  reminder: string
}

// ── Parsing ───────────────────────────────────────────────────

/**
 * Parse raw base-rules.md content into three sections.
 * Sections are delimited by `## AGENTS_RULES`, `## SOUL_RULES`, `## REMINDER`.
 */
export function parseBaseRules(raw: string): BaseRules {
  const sections: Record<string, string> = {}
  const sectionPattern = /^## (AGENTS_RULES|SOUL_RULES|REMINDER)\s*$/gm
  const matches: RegExpExecArray[] = []
  let m: RegExpExecArray | null
  while ((m = sectionPattern.exec(raw)) !== null) {
    matches.push(m)
  }

  for (let i = 0; i < matches.length; i++) {
    const key = matches[i][1]
    const start = matches[i].index + matches[i][0].length
    const end = i + 1 < matches.length ? matches[i + 1].index : raw.length
    sections[key] = raw.slice(start, end).trim()
  }

  return {
    agentsRules: sections['AGENTS_RULES'] || '',
    soulRules: sections['SOUL_RULES'] || '',
    reminder: sections['REMINDER'] || '',
  }
}

// ── Strip / inject helpers ────────────────────────────────────

/**
 * Remove everything between (and including) `startMarker` and `endMarker`.
 */
export function stripMarkerBlock(content: string, startMarker: string, endMarker: string): string {
  const startIdx = content.indexOf(startMarker)
  if (startIdx === -1) return content
  const endIdx = content.indexOf(endMarker, startIdx)
  if (endIdx === -1) return content

  const before = content.slice(0, startIdx)
  const after = content.slice(endIdx + endMarker.length)

  // Clean up: remove at most one leading blank line from `after`
  const cleaned = after.replace(/^\n{1,2}/, '\n')
  return (before + cleaned).replace(/^\n+/, '')
}

/**
 * Inject agentsRules at the top and reminder at the bottom of AGENTS.md content.
 * Strips existing marker blocks first (idempotent).
 */
export function injectIntoAgentsMd(content: string, agentsRules: string, reminder: string): string {
  // Strip existing blocks
  let cleaned = stripMarkerBlock(content, AGENTS_BEGIN, AGENTS_END)
  cleaned = stripMarkerBlock(cleaned, REMINDER_BEGIN, REMINDER_END)
  cleaned = cleaned.trim()

  const parts: string[] = []

  // Head: forced protocol
  if (agentsRules) {
    parts.push(`${AGENTS_BEGIN}`)
    parts.push(`# 强制执行协议\n`)
    parts.push(agentsRules)
    parts.push(`${AGENTS_END}`)
    parts.push('')
  }

  // Original content
  parts.push(cleaned)

  // Tail: reminder
  if (reminder) {
    parts.push('')
    parts.push(`${REMINDER_BEGIN}`)
    parts.push(`---`)
    parts.push(reminder)
    parts.push(`${REMINDER_END}`)
  }

  return parts.join('\n') + '\n'
}

/**
 * Inject soulRules at the top of SOUL.md content.
 * Strips existing marker block first (idempotent).
 */
export function injectIntoSoulMd(content: string, soulRules: string): string {
  let cleaned = stripMarkerBlock(content, SOUL_BEGIN, SOUL_END)
  cleaned = cleaned.trim()

  const parts: string[] = []

  if (soulRules) {
    parts.push(`${SOUL_BEGIN}`)
    parts.push(`## 底层信念\n`)
    parts.push(soulRules)
    parts.push(`${SOUL_END}`)
    parts.push('')
  }

  parts.push(cleaned)

  return parts.join('\n') + '\n'
}

// ── High-level: inject for a single agent directory ───────────

/**
 * Read config/base-rules.md, parse it, and inject into the given agent directory's
 * AGENTS.md and SOUL.md. No-op if base-rules.md doesn't exist.
 */
export function injectBaseRulesForAgent(agentDir: string): void {
  if (!existsSync(BASE_RULES_PATH)) return

  const raw = readFileSync(BASE_RULES_PATH, 'utf-8')
  const rules = parseBaseRules(raw)

  // Inject into AGENTS.md
  const agentsMdPath = join(agentDir, 'AGENTS.md')
  if (existsSync(agentsMdPath)) {
    const original = readFileSync(agentsMdPath, 'utf-8')
    const injected = injectIntoAgentsMd(original, rules.agentsRules, rules.reminder)
    writeFileSync(agentsMdPath, injected)
  }

  // Inject into SOUL.md
  const soulMdPath = join(agentDir, 'SOUL.md')
  if (existsSync(soulMdPath)) {
    const original = readFileSync(soulMdPath, 'utf-8')
    const injected = injectIntoSoulMd(original, rules.soulRules)
    writeFileSync(soulMdPath, injected)
  }
}
