#!/usr/bin/env node
/**
 * migrate-sync-templates.mjs — Sync builtin template AGENTS.md to existing agents
 *
 * Non-destructive: only updates AGENTS.md for agents whose templateId matches
 * a builtin template. Creates a backup before overwriting.
 *
 * Usage:
 *   node scripts/migrate-sync-templates.mjs              # execute
 *   node scripts/migrate-sync-templates.mjs --dry-run    # preview only
 *   node scripts/migrate-sync-templates.mjs pm frontend  # sync specific agents only
 */

import { readdirSync, readFileSync, writeFileSync, existsSync, copyFileSync } from 'fs'
import { join, resolve } from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const ROOT = resolve(__dirname, '..')

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const filterIds = args.filter(a => !a.startsWith('--'))

const log = (msg) => console.log(`${dryRun ? '[DRY-RUN] ' : ''}${msg}`)

const AGENTS_DIR = join(ROOT, 'agents')
const TEMPLATES_DIR = join(ROOT, 'templates', 'builtin')

if (!existsSync(AGENTS_DIR)) {
  console.log('No agents/ directory found. Nothing to sync.')
  process.exit(0)
}

if (!existsSync(TEMPLATES_DIR)) {
  console.error('ERROR: templates/builtin/ not found.')
  process.exit(1)
}

log('=== Sync builtin templates → agents/ ===\n')

const agentDirs = readdirSync(AGENTS_DIR, { withFileTypes: true })
  .filter(d => d.isDirectory() && !d.name.startsWith('.'))

let synced = 0
let skipped = 0
let unchanged = 0

for (const d of agentDirs) {
  const agentId = d.name

  // If specific agents requested, skip others
  if (filterIds.length > 0 && !filterIds.includes(agentId)) continue

  const agentJsonPath = join(AGENTS_DIR, agentId, 'agent.json')
  if (!existsSync(agentJsonPath)) {
    log(`  skip ${agentId} — no agent.json`)
    skipped++
    continue
  }

  let agentJson
  try {
    agentJson = JSON.parse(readFileSync(agentJsonPath, 'utf-8'))
  } catch {
    log(`  skip ${agentId} — invalid agent.json`)
    skipped++
    continue
  }

  const templateId = agentJson.templateId || agentJson.role || agentId
  const templateAgentsMd = join(TEMPLATES_DIR, templateId, 'AGENTS.md')

  if (!existsSync(templateAgentsMd)) {
    log(`  skip ${agentId} — no builtin template "${templateId}"`)
    skipped++
    continue
  }

  const agentAgentsMd = join(AGENTS_DIR, agentId, 'AGENTS.md')
  const newContent = readFileSync(templateAgentsMd, 'utf-8')

  // Compare: skip if already identical
  if (existsSync(agentAgentsMd)) {
    const currentContent = readFileSync(agentAgentsMd, 'utf-8')

    // Compare only the template portion (before base-rules marker if present)
    const marker = '<!-- BASE_RULES:AGENTS_START -->'
    const currentBody = currentContent.includes(marker)
      ? currentContent.slice(0, currentContent.indexOf(marker)).trimEnd()
      : currentContent.trimEnd()
    const newBody = newContent.trimEnd()

    if (currentBody === newBody) {
      log(`  unchanged ${agentId}`)
      unchanged++
      continue
    }
  }

  // Backup existing AGENTS.md
  if (!dryRun && existsSync(agentAgentsMd)) {
    const backupPath = agentAgentsMd + '.bak'
    copyFileSync(agentAgentsMd, backupPath)
  }

  // Write new AGENTS.md (preserve base-rules if present)
  if (!dryRun) {
    let finalContent = newContent

    // If the old file had injected base-rules, preserve that section
    if (existsSync(agentAgentsMd)) {
      const oldContent = readFileSync(agentAgentsMd + '.bak', 'utf-8')
      const startMarker = '<!-- BASE_RULES:AGENTS_START -->'
      const endMarker = '<!-- BASE_RULES:AGENTS_END -->'
      const startIdx = oldContent.indexOf(startMarker)
      const endIdx = oldContent.indexOf(endMarker)

      if (startIdx !== -1 && endIdx !== -1) {
        const baseRulesBlock = oldContent.slice(startIdx, endIdx + endMarker.length)
        finalContent = newContent.trimEnd() + '\n\n' + baseRulesBlock + '\n'
      }
    }

    writeFileSync(agentAgentsMd, finalContent)
  }

  log(`  synced ${agentId} ← templates/builtin/${templateId}/AGENTS.md`)
  synced++
}

log(`\n=== Summary ===`)
log(`  Synced:    ${synced}`)
log(`  Unchanged: ${unchanged}`)
log(`  Skipped:   ${skipped}`)

if (synced > 0 && !dryRun) {
  log(`\nBackups saved as AGENTS.md.bak`)
  log(`Run "node scripts/inject-base-rules.mjs" to re-inject base-rules.`)
}

if (dryRun) {
  log(`\n[DRY-RUN] No changes were made. Run without --dry-run to apply.`)
}
