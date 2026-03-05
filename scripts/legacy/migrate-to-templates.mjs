#!/usr/bin/env node
/**
 * Migration script: agents/ → templates/builtin/
 *
 * One-time migration. Skips automatically if already completed.
 *
 * This script:
 * 1. Verifies templates/builtin/ has all template.json files
 * 2. Backs up agents/ before any destructive operation
 * 3. Preserves non-core output (moves to workspaces/) then clears agents/
 * 4. For each existing workspace, recreates agents/{id}/agent.json referencing the template
 * 5. Empties config/openclaw.json agents.list
 *
 * Usage: node scripts/migrate-to-templates.mjs [--dry-run] [--force]
 */

import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, cpSync, lstatSync, renameSync } from 'fs'
import { join, resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const ROOT = resolve(__dirname, '..')

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const force = args.includes('--force')
const log = (msg) => console.log(`${dryRun ? '[DRY-RUN] ' : ''}${msg}`)

const AGENTS_DIR = join(ROOT, 'agents')
const TEMPLATES_DIR = join(ROOT, 'templates', 'builtin')
const WORKSPACES_DIR = join(ROOT, 'workspaces')
const OPENCLAW_CONFIG = join(ROOT, 'config', 'openclaw.json')
const MIGRATIONS_DIR = join(ROOT, '.openclaw-state', 'migrations')
const MARKER = join(MIGRATIONS_DIR, 'migrate-to-templates.done')
const BACKUPS_DIR = join(ROOT, '.openclaw-state', 'backups')

// ── Idempotency check ──
if (!force && existsSync(MARKER)) {
  const doneAt = readFileSync(MARKER, 'utf-8').trim()
  console.log(`migrate-to-templates: already completed (${doneAt}). Use --force to re-run.`)
  process.exit(0)
}

// Agent core files/dirs — should NOT be moved to workspaces
const CORE_ENTRIES = new Set([
  'AGENTS.md', 'SOUL.md', 'IDENTITY.md', 'TOOLS.md', 'MEMORY.md',
  'USER.md', 'HEARTBEAT.md', 'agent.json',
  'memory', 'skills',
  'agents',  // openclaw runtime subdir
])

// Step 1: Verify templates/builtin/ exists and has template.json files
log('=== Step 1: Verify templates/builtin/ ===')
if (!existsSync(TEMPLATES_DIR)) {
  console.error('ERROR: templates/builtin/ does not exist. Run the template creation step first.')
  process.exit(1)
}

const templateDirs = readdirSync(TEMPLATES_DIR, { withFileTypes: true })
  .filter(d => d.isDirectory())

for (const d of templateDirs) {
  const tmplPath = join(TEMPLATES_DIR, d.name, 'template.json')
  if (existsSync(tmplPath)) {
    log(`  ✓ ${d.name}/template.json`)
  } else {
    log(`  ✗ ${d.name}/template.json — MISSING`)
  }
}

// Step 1.5: Backup agents/ before any destructive operation
if (existsSync(AGENTS_DIR)) {
  const agentDirs = readdirSync(AGENTS_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory() && !d.name.startsWith('.'))

  if (agentDirs.length > 0) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const backupDir = join(BACKUPS_DIR, `agents-${timestamp}`)
    log(`\n=== Backup: agents/ → ${backupDir} ===`)
    if (!dryRun) {
      mkdirSync(backupDir, { recursive: true })
      for (const d of agentDirs) {
        cpSync(join(AGENTS_DIR, d.name), join(backupDir, d.name), { recursive: true })
      }
    }
    log(`  Backed up ${agentDirs.length} agent(s)`)
  }
}

// Step 2: Preserve non-core content, then clear agents/ directory
log('\n=== Step 2: Preserve output & clear agents/ ===')
if (existsSync(AGENTS_DIR)) {
  const agentDirs = readdirSync(AGENTS_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory() && !d.name.startsWith('.'))

  for (const d of agentDirs) {
    const agentDir = join(AGENTS_DIR, d.name)
    const workspaceDir = join(WORKSPACES_DIR, d.name)

    // Move non-core entries to workspaces/ before deleting
    const entries = readdirSync(agentDir, { withFileTypes: true })
    for (const entry of entries) {
      if (CORE_ENTRIES.has(entry.name)) continue
      if (entry.name.startsWith('.')) continue

      const src = join(agentDir, entry.name)

      // Skip symlinks
      try {
        if (lstatSync(src).isSymbolicLink()) continue
      } catch { continue }

      const dest = join(workspaceDir, entry.name)
      if (existsSync(dest)) {
        log(`  skip ${d.name}/${entry.name} (already in workspaces/)`)
        continue
      }

      log(`  preserve ${d.name}/${entry.name} → workspaces/${d.name}/${entry.name}`)
      if (!dryRun) {
        mkdirSync(workspaceDir, { recursive: true })
        renameSync(src, dest)
      }
    }

    log(`  Removing agents/${d.name}/`)
    if (!dryRun) {
      rmSync(agentDir, { recursive: true, force: true })
    }
  }
}

// Ensure agents/.gitkeep exists
if (!dryRun) {
  mkdirSync(AGENTS_DIR, { recursive: true })
  writeFileSync(join(AGENTS_DIR, '.gitkeep'), '')
}
log('  Created agents/.gitkeep')

// Step 3: For each existing workspace, recreate agent instance
log('\n=== Step 3: Recreate agent instances from workspaces ===')
const recreated = []

if (existsSync(WORKSPACES_DIR)) {
  const workspaceDirs = readdirSync(WORKSPACES_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory())

  for (const d of workspaceDirs) {
    const wsId = d.name
    // Check if there's a matching template
    const tmplPath = join(TEMPLATES_DIR, wsId, 'template.json')
    if (!existsSync(tmplPath)) {
      log(`  Skipping workspace ${wsId} — no matching template`)
      continue
    }

    const template = JSON.parse(readFileSync(tmplPath, 'utf-8'))

    // Create agents/{id}/ with agent.json
    const agentDir = join(AGENTS_DIR, wsId)
    const agentJson = {
      id: wsId,
      templateId: template.id,
      name: template.name,
      role: template.id,
      description: template.description || '',
      model: template.defaults?.model || undefined,
      skills: template.defaults?.skills || [],
      peers: template.defaults?.peers || [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    log(`  Recreating agents/${wsId}/ from template "${template.id}"`)
    if (!dryRun) {
      mkdirSync(join(agentDir, 'skills'), { recursive: true })
      writeFileSync(join(agentDir, 'agent.json'), JSON.stringify(agentJson, null, 2) + '\n')

      // Copy AGENTS.md and TOOLS.md from template
      const tmplDir = join(TEMPLATES_DIR, template.id)
      const agentsMdSrc = join(tmplDir, 'AGENTS.md')
      const toolsMdSrc = join(tmplDir, 'TOOLS.md')
      if (existsSync(agentsMdSrc)) {
        cpSync(agentsMdSrc, join(agentDir, 'AGENTS.md'))
      }
      if (existsSync(toolsMdSrc)) {
        cpSync(toolsMdSrc, join(agentDir, 'TOOLS.md'))
      }
    }
    recreated.push(wsId)
  }
}

// Step 4: Update openclaw.json — empty the agents.list
log('\n=== Step 4: Update openclaw.json ===')
if (existsSync(OPENCLAW_CONFIG)) {
  const config = JSON.parse(readFileSync(OPENCLAW_CONFIG, 'utf-8'))
  const oldCount = config.agents?.list?.length || 0

  config.agents = config.agents || {}
  config.agents.list = []

  log(`  Cleared agents.list (was ${oldCount} entries)`)

  if (!dryRun) {
    writeFileSync(OPENCLAW_CONFIG, JSON.stringify(config, null, 2) + '\n')
  }
}

// Write completion marker
if (!dryRun) {
  mkdirSync(MIGRATIONS_DIR, { recursive: true })
  writeFileSync(MARKER, new Date().toISOString())
}

// Summary
log('\n=== Migration Summary ===')
log(`  Templates verified: ${templateDirs.length}`)
log(`  Agent instances recreated: ${recreated.length} (${recreated.join(', ') || 'none'})`)
log(`  openclaw.json agents.list: emptied`)

if (dryRun) {
  log('\n[DRY-RUN] No changes were made. Run without --dry-run to apply.')
} else {
  log('\nMigration complete. Start the gateway to verify.')
}
