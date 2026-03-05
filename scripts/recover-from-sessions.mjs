#!/usr/bin/env node
/**
 * recover-from-sessions.mjs
 *
 * Recovers files written by agents from OpenClaw session history.
 * Parses .openclaw-state/agents/{id}/sessions/*.jsonl and extracts
 * file-write tool calls (write, create, etc.), rebuilding the files
 * into workspaces/{id}/.
 *
 * Usage:
 *   node scripts/recover-from-sessions.mjs                    # recover all agents
 *   node scripts/recover-from-sessions.mjs novel-writer        # recover single agent
 *   node scripts/recover-from-sessions.mjs --dry-run           # preview only
 *   node scripts/recover-from-sessions.mjs --list              # list recoverable files
 */

import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join, resolve, dirname, relative, isAbsolute } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

const SESSIONS_BASE = join(ROOT, '.openclaw-state', 'agents')
const AGENTS_DIR = join(ROOT, 'agents')
const WORKSPACES_DIR = join(ROOT, 'workspaces')

const DRY_RUN = process.argv.includes('--dry-run')
const LIST_ONLY = process.argv.includes('--list')
const targetId = process.argv.slice(2).find(a => !a.startsWith('--'))

// Tool names that write files
const WRITE_TOOLS = new Set([
  'write', 'write_file', 'create', 'create_file',
  'writeFile', 'createFile',
  'Write', 'WriteFile',
])

function log(msg) {
  console.log(DRY_RUN ? `[DRY-RUN] ${msg}` : msg)
}

function getAgentIds() {
  if (!existsSync(SESSIONS_BASE)) return []
  return readdirSync(SESSIONS_BASE, { withFileTypes: true })
    .filter(d => d.isDirectory() && !d.name.startsWith('.') && d.name !== 'main')
    .map(d => d.name)
}

function parseSessionFile(filePath) {
  const writes = []
  const lines = readFileSync(filePath, 'utf-8').split('\n').filter(Boolean)

  for (const line of lines) {
    try {
      const entry = JSON.parse(line)
      if (entry.type !== 'message') continue
      const msg = entry.message
      if (!msg || msg.role !== 'assistant') continue
      if (!Array.isArray(msg.content)) continue

      for (const block of msg.content) {
        if (block.type !== 'toolCall') continue
        if (!WRITE_TOOLS.has(block.name)) continue

        const args = block.arguments || {}
        const filePath = args.path || args.file_path || args.filePath || args.filename
        const content = args.content || args.text || args.data

        if (filePath && content) {
          writes.push({
            path: filePath,
            content,
            timestamp: entry.timestamp || entry.message?.timestamp,
            toolName: block.name,
          })
        }
      }
    } catch { /* skip malformed lines */ }
  }

  return writes
}

function normalizePathForAgent(agentId, filePath) {
  // Try to resolve relative to agent's workspace
  // Common patterns:
  //   /full/path/to/agents/{id}/novel/chapter-1.md
  //   /full/path/to/workspaces/{id}/novel/chapter-1.md
  //   novel/chapter-1.md (relative)

  if (isAbsolute(filePath)) {
    // Check if it's under agents/{id}/ or workspaces/{id}/
    const agentPrefix = join(AGENTS_DIR, agentId) + '/'
    const wsPrefix = join(WORKSPACES_DIR, agentId) + '/'

    if (filePath.startsWith(agentPrefix)) {
      return relative(agentPrefix, filePath)
    }
    if (filePath.startsWith(wsPrefix)) {
      return relative(wsPrefix, filePath)
    }

    // Try broader patterns (different install paths)
    const patterns = [
      `/agents/${agentId}/`,
      `/workspaces/${agentId}/`,
    ]
    for (const pattern of patterns) {
      const idx = filePath.indexOf(pattern)
      if (idx !== -1) {
        return filePath.slice(idx + pattern.length)
      }
    }

    // Absolute path outside agent dir — skip
    return null
  }

  return filePath
}

function recoverAgent(agentId) {
  const sessionsDir = join(SESSIONS_BASE, agentId, 'sessions')
  if (!existsSync(sessionsDir)) {
    log(`  No sessions found for ${agentId}`)
    return 0
  }

  const sessionFiles = readdirSync(sessionsDir)
    .filter(f => f.endsWith('.jsonl'))
    .sort()

  log(`\n── ${agentId} (${sessionFiles.length} session files) ──`)

  // Collect all writes, later ones override earlier ones (same path)
  const fileMap = new Map() // relativePath → { content, timestamp }

  for (const sf of sessionFiles) {
    const writes = parseSessionFile(join(sessionsDir, sf))
    for (const w of writes) {
      const relPath = normalizePathForAgent(agentId, w.path)
      if (!relPath) continue

      // Skip core files
      const topLevel = relPath.split('/')[0]
      if (['AGENTS.md', 'SOUL.md', 'IDENTITY.md', 'TOOLS.md', 'MEMORY.md',
           'USER.md', 'HEARTBEAT.md', 'agent.json'].includes(topLevel)) continue

      fileMap.set(relPath, { content: w.content, timestamp: w.timestamp })
    }
  }

  if (fileMap.size === 0) {
    log(`  No recoverable files found`)
    return 0
  }

  log(`  Found ${fileMap.size} recoverable file(s):`)

  const workspaceDir = join(WORKSPACES_DIR, agentId)
  let recovered = 0

  for (const [relPath, { content, timestamp }] of fileMap) {
    const destPath = join(workspaceDir, relPath)
    const exists = existsSync(destPath)
    const sizeKB = (Buffer.byteLength(content, 'utf-8') / 1024).toFixed(1)

    if (LIST_ONLY) {
      log(`    ${exists ? '[EXISTS]' : '[RECOVER]'} ${relPath} (${sizeKB} KB)`)
      continue
    }

    if (exists) {
      log(`    skip ${relPath} (already exists)`)
      continue
    }

    log(`    recover ${relPath} (${sizeKB} KB)`)
    if (!DRY_RUN) {
      mkdirSync(dirname(destPath), { recursive: true })
      writeFileSync(destPath, content)
    }
    recovered++
  }

  return recovered
}

// ── Main ──

console.log(`\n${'='.repeat(60)}`)
console.log(`  Agent Factory — Session Recovery`)
console.log(`  ${LIST_ONLY ? 'LIST MODE' : DRY_RUN ? 'DRY RUN (no changes)' : 'EXECUTING'}`)
console.log(`${'='.repeat(60)}`)

const agentIds = targetId ? [targetId] : getAgentIds()
console.log(`\nScanning ${agentIds.length} agent(s): ${agentIds.join(', ')}`)

let totalRecovered = 0
for (const id of agentIds) {
  totalRecovered += recoverAgent(id)
}

console.log(`\n${'='.repeat(60)}`)
if (LIST_ONLY) {
  console.log(`  Listed recoverable files. Run without --list to recover.`)
} else if (DRY_RUN) {
  console.log(`  Dry run complete. Run without --dry-run to execute.`)
} else {
  console.log(`  Recovered ${totalRecovered} file(s).`)
}
console.log(`${'='.repeat(60)}\n`)
