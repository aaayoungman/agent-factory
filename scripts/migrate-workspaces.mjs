#!/usr/bin/env node
/**
 * migrate-workspaces.mjs
 *
 * Migrates existing agents to the new workspace layout:
 * 1. Creates symlinks in workspaces/{id}/ → agents/{id}/ for definition files
 * 2. Moves output directories (e.g. agents/novel-chief/novel/) to workspaces/{id}/
 * 3. Updates config/openclaw.json workspace paths to workspaces/{id}
 * 4. Creates projects/novel/ and assigns all novel-department agents
 *
 * Usage:
 *   node scripts/migrate-workspaces.mjs           # execute migration
 *   node scripts/migrate-workspaces.mjs --dry-run  # preview only
 */

import { existsSync, readdirSync, mkdirSync, symlinkSync, renameSync, readFileSync, writeFileSync, lstatSync, statSync } from 'fs'
import { join, resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const PROJECT_ROOT = resolve(__dirname, '..')

const AGENTS_DIR = join(PROJECT_ROOT, 'agents')
const WORKSPACES_DIR = join(PROJECT_ROOT, 'workspaces')
const PROJECTS_DIR = join(PROJECT_ROOT, 'projects')
const OPENCLAW_CONFIG = join(PROJECT_ROOT, 'config', 'openclaw.json')

const DRY_RUN = process.argv.includes('--dry-run')

function log(msg) {
  console.log(DRY_RUN ? `[DRY-RUN] ${msg}` : msg)
}

// Definition files/dirs that should be symlinked (not moved)
const SYMLINK_FILES = ['AGENTS.md', 'SOUL.md', 'IDENTITY.md', 'TOOLS.md', 'MEMORY.md', 'USER.md', 'HEARTBEAT.md', 'agent.json']
const SYMLINK_DIRS = ['memory', 'skills']

// Known definition entries (should NOT be moved as output)
const DEFINITION_ENTRIES = new Set([
  ...SYMLINK_FILES,
  ...SYMLINK_DIRS,
  'agents',  // agents subdir created by openclaw runtime
])

function getAgentIds() {
  if (!existsSync(AGENTS_DIR)) return []
  return readdirSync(AGENTS_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory() && !d.name.startsWith('.'))
    .map(d => d.name)
}

function migrateAgent(agentId) {
  const agentDir = join(AGENTS_DIR, agentId)
  const workspaceDir = join(WORKSPACES_DIR, agentId)

  log(`\n── Migrating: ${agentId} ──`)

  // 1. Ensure workspace dir exists
  if (!existsSync(workspaceDir)) {
    log(`  mkdir ${workspaceDir}`)
    if (!DRY_RUN) mkdirSync(workspaceDir, { recursive: true })
  }

  // 2. Create symlinks for definition files
  for (const f of SYMLINK_FILES) {
    const target = join(agentDir, f)
    const link = join(workspaceDir, f)
    if (!existsSync(target)) continue
    if (existsSync(link) || (lstatExistsSafe(link))) {
      log(`  skip symlink ${f} (already exists)`)
      continue
    }
    log(`  symlink ${f} → agents/${agentId}/${f}`)
    if (!DRY_RUN) symlinkSync(target, link)
  }

  // 3. Create symlinks for definition directories
  for (const d of SYMLINK_DIRS) {
    const target = join(agentDir, d)
    const link = join(workspaceDir, d)
    if (!existsSync(target)) continue
    if (existsSync(link) || lstatExistsSafe(link)) {
      log(`  skip symlink ${d}/ (already exists)`)
      continue
    }
    log(`  symlink ${d}/ → agents/${agentId}/${d}/`)
    if (!DRY_RUN) symlinkSync(target, link)
  }

  // 4. Move output directories to workspace
  const entries = readdirSync(agentDir, { withFileTypes: true })
  for (const entry of entries) {
    if (DEFINITION_ENTRIES.has(entry.name)) continue
    if (entry.name.startsWith('.')) continue

    // This is an output directory/file — move it
    const src = join(agentDir, entry.name)
    const dest = join(workspaceDir, entry.name)

    if (existsSync(dest)) {
      log(`  skip move ${entry.name} (already exists in workspace)`)
      continue
    }

    log(`  move ${entry.name} → workspaces/${agentId}/${entry.name}`)
    if (!DRY_RUN) renameSync(src, dest)
  }
}

/** lstat that returns false instead of throwing for broken symlinks */
function lstatExistsSafe(path) {
  try {
    lstatSync(path)
    return true
  } catch {
    return false
  }
}

function updateOpenclawConfig(agentIds) {
  if (!existsSync(OPENCLAW_CONFIG)) {
    log('\nNo openclaw.json found — skipping config update')
    return
  }

  log('\n── Updating config/openclaw.json ──')
  const config = JSON.parse(readFileSync(OPENCLAW_CONFIG, 'utf-8'))
  const list = config.agents?.list || []
  let changed = 0

  for (const entry of list) {
    if (!entry.id || !entry.workspace) continue
    const expectedWorkspace = join(WORKSPACES_DIR, entry.id)

    if (entry.workspace !== expectedWorkspace) {
      log(`  ${entry.id}: ${entry.workspace} → ${expectedWorkspace}`)
      entry.workspace = expectedWorkspace
      changed++
    } else {
      log(`  ${entry.id}: already correct`)
    }
  }

  if (changed > 0) {
    log(`  Updated ${changed} workspace path(s)`)
    if (!DRY_RUN) {
      writeFileSync(OPENCLAW_CONFIG, JSON.stringify(config, null, 2) + '\n')
    }
  } else {
    log(`  All workspace paths already correct`)
  }
}

function createNovelProject(agentIds) {
  const novelAgents = agentIds.filter(id => {
    try {
      const agentJson = JSON.parse(readFileSync(join(AGENTS_DIR, id, 'agent.json'), 'utf-8'))
      return agentJson.department === 'novel'
    } catch {
      return false
    }
  })

  if (novelAgents.length === 0) {
    log('\nNo novel-department agents found — skipping project creation')
    return
  }

  const projectDir = join(PROJECTS_DIR, 'novel')
  log(`\n── Creating projects/novel/ (${novelAgents.length} agents) ──`)

  if (existsSync(projectDir)) {
    // Update assignedAgents in existing meta
    const metaPath = join(projectDir, '.project-meta.json')
    if (existsSync(metaPath)) {
      const meta = JSON.parse(readFileSync(metaPath, 'utf-8'))
      const existing = new Set(meta.assignedAgents || [])
      let added = 0
      for (const id of novelAgents) {
        if (!existing.has(id)) {
          existing.add(id)
          added++
        }
      }
      if (added > 0) {
        meta.assignedAgents = [...existing]
        log(`  Added ${added} agents to existing project`)
        if (!DRY_RUN) writeFileSync(metaPath, JSON.stringify(meta, null, 2) + '\n')
      } else {
        log(`  All agents already assigned`)
      }
    }
    return
  }

  log(`  Creating directory structure`)
  if (!DRY_RUN) {
    for (const sub of ['docs', 'design', 'src', 'tests']) {
      mkdirSync(join(projectDir, sub), { recursive: true })
    }
  }

  const now = new Date().toISOString()
  const meta = {
    name: 'novel',
    description: 'Novel writing project — all novel-department agents',
    status: 'planning',
    currentPhase: 1,
    totalPhases: 5,
    createdAt: now,
    tokensUsed: 0,
    tasks: [],
    assignedAgents: novelAgents,
  }

  log(`  Writing .project-meta.json with agents: ${novelAgents.join(', ')}`)
  if (!DRY_RUN) {
    writeFileSync(join(projectDir, '.project-meta.json'), JSON.stringify(meta, null, 2) + '\n')
  }

  const brief = `# Project Brief: Novel

**Project ID:** novel
**Created:** ${now}
**Description:** Novel writing project — all novel-department agents

## Shared Workspace

This project's shared workspace is at:
\`${projectDir}\`

## Directory Conventions

- \`docs/\` — All written documents: outlines, character bibles, world-building notes
- \`design/\` — Story structure designs, chapter plans
- \`src/\` — Manuscript chapters and drafts
- \`tests/\` — Continuity checks, style reviews, reader feedback
`
  log(`  Writing BRIEF.md`)
  if (!DRY_RUN) {
    writeFileSync(join(projectDir, 'BRIEF.md'), brief)
  }
}

// ── Main ──

console.log(`\n${'='.repeat(60)}`)
console.log(`  Agent Factory — Workspace Migration`)
console.log(`  ${DRY_RUN ? '🔍 DRY RUN MODE (no changes will be made)' : '🚀 EXECUTING MIGRATION'}`)
console.log(`${'='.repeat(60)}`)

const agentIds = getAgentIds()
console.log(`\nFound ${agentIds.length} agent(s): ${agentIds.join(', ')}`)

// Step 1: Migrate each agent
for (const id of agentIds) {
  migrateAgent(id)
}

// Step 2: Update openclaw.json
updateOpenclawConfig(agentIds)

// Step 3: Create novel project
createNovelProject(agentIds)

console.log(`\n${'='.repeat(60)}`)
if (DRY_RUN) {
  console.log(`  Dry run complete. Run without --dry-run to execute.`)
} else {
  console.log(`  Migration complete! Restart Gateway to apply changes.`)
}
console.log(`${'='.repeat(60)}\n`)
