#!/usr/bin/env node
/**
 * Migration script: agents/ → templates/builtin/
 *
 * This script:
 * 1. Verifies templates/builtin/ has all template.json files
 * 2. Clears agents/ directory (only live instances should be here)
 * 3. For each existing workspace, recreates agents/{id}/agent.json referencing the template
 * 4. Empties config/openclaw.json agents.list
 *
 * Usage: node scripts/migrate-to-templates.mjs [--dry-run]
 */

import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, cpSync } from 'fs'
import { join, resolve } from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const ROOT = resolve(__dirname, '..')

const dryRun = process.argv.includes('--dry-run')
const log = (msg) => console.log(`${dryRun ? '[DRY-RUN] ' : ''}${msg}`)

const AGENTS_DIR = join(ROOT, 'agents')
const TEMPLATES_DIR = join(ROOT, 'templates', 'builtin')
const WORKSPACES_DIR = join(ROOT, 'workspaces')
const OPENCLAW_CONFIG = join(ROOT, 'config', 'openclaw.json')

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

// Step 2: Clear agents/ directory
log('\n=== Step 2: Clear agents/ directory ===')
if (existsSync(AGENTS_DIR)) {
  const agentDirs = readdirSync(AGENTS_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory())

  for (const d of agentDirs) {
    log(`  Removing agents/${d.name}/`)
    if (!dryRun) {
      rmSync(join(AGENTS_DIR, d.name), { recursive: true, force: true })
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
