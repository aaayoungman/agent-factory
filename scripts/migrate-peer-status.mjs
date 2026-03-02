#!/usr/bin/env node
/**
 * migrate-peer-status.mjs — One-time migration to:
 * 1. Add peer-status skill to all existing agents with peers
 * 2. Create symlink for peer-status skill
 * 3. Regenerate TOOLS.md
 * 4. Regenerate AGENTS.md (with peer communication directory)
 * 5. Re-inject base-rules
 */

import { existsSync, readFileSync, writeFileSync, readdirSync, symlinkSync, lstatSync, unlinkSync, mkdirSync } from 'fs'
import { join, resolve } from 'path'

const PROJECT_ROOT = resolve(new URL('.', import.meta.url).pathname, '..')
const AGENTS_DIR = join(PROJECT_ROOT, 'agents')
const SKILLS_DIR = join(PROJECT_ROOT, 'skills')
const PEER_STATUS_SKILL_DIR = join(SKILLS_DIR, 'peer-status')

// ── TOOLS.md generation (mirrors route.ts logic) ─────────────────

function parseSkillMeta(skillMd) {
  const fmMatch = skillMd.match(/^---\n([\s\S]*?)\n---/)
  if (!fmMatch) return { name: '', description: '', bins: [] }
  const fm = fmMatch[1]
  const name = fm.match(/^name:\s*(.+)/m)?.[1]?.trim().replace(/['"]/g, '') || ''
  const description = fm.match(/^description:\s*"?(.+?)"?\s*$/m)?.[1]?.trim() || ''
  return { name, description, bins: [] }
}

function generateToolsMd(agentId, skills, agentDir) {
  const lines = [`# TOOLS.md — ${agentId} Agent`, '']

  if (skills.length === 0) {
    lines.push('No skills configured for this agent.', '', '---')
    lines.push('_Auto-generated on deploy. Edit agent.json skills[] to update._')
    return lines.join('\n')
  }

  lines.push('## Available Skills', '')

  for (const slug of skills) {
    const skillMdPath = join(agentDir, 'skills', slug, 'SKILL.md')
    if (existsSync(skillMdPath)) {
      try {
        const { name, description, bins } = parseSkillMeta(readFileSync(skillMdPath, 'utf-8'))
        lines.push(`### ${name || slug}`)
        if (description) lines.push(description)
        if (bins.length > 0) lines.push(`- **Requires:** ${bins.map(b => `\`${b}\``).join(', ')} on PATH`)
        lines.push(`- Full docs: \`skills/${slug}/SKILL.md\``, '')
        continue
      } catch {}
    }
    lines.push(`### ${slug}`, `- Full docs: \`skills/${slug}/SKILL.md\``, '')
  }

  // Add peer communication quick reference if peer-status skill installed
  if (skills.includes('peer-status')) {
    lines.push('## Peer Communication Quick Reference', '')
    lines.push('### 查询 peer 在线状态', '')
    lines.push('```bash')
    lines.push(`node skills/peer-status/scripts/peer-status.mjs --agent-id ${agentId}`)
    lines.push('```')
    lines.push('输出 JSON 数组：`[{ id, name, status, updatedAt }]`，status 为 `busy` 或 `online`。', '')
    lines.push('### 发送跨 Agent 消息', '')
    lines.push('```bash')
    lines.push(`# 同步模式（等待回复）`)
    lines.push(`node skills/peer-status/scripts/peer-send.mjs --from ${agentId} --to <peerId> --message "消息内容"`)
    lines.push('')
    lines.push(`# 异步模式（发送后立即返回）`)
    lines.push(`node skills/peer-status/scripts/peer-send.mjs --from ${agentId} --to <peerId> --message "消息内容" --no-wait`)
    lines.push('```')
    lines.push('> **注意**：禁止使用 `sessions_send` 跨 Agent 发消息，会被 Gateway 阻断。必须使用 `peer-send` 脚本。', '')
  }

  lines.push('---')
  lines.push('_Auto-generated from agent.json skills[] on deploy. Run "Sync Config" to regenerate._')
  return lines.join('\n')
}

// ── AGENTS.md peer directory injection ───────────────────────────

const PEER_DIR_BEGIN = '<!-- PEER-DIRECTORY:BEGIN -->'
const PEER_DIR_END = '<!-- PEER-DIRECTORY:END -->'

function stripPeerDirectory(content) {
  const startIdx = content.indexOf(PEER_DIR_BEGIN)
  if (startIdx === -1) return content
  const endIdx = content.indexOf(PEER_DIR_END, startIdx)
  if (endIdx === -1) return content
  const before = content.slice(0, startIdx)
  const after = content.slice(endIdx + PEER_DIR_END.length)
  return (before + after.replace(/^\n{1,2}/, '\n')).replace(/\n{3,}/g, '\n\n')
}

function injectPeerDirectory(content, peers, agentId) {
  // Strip existing peer directory first (idempotent)
  let cleaned = stripPeerDirectory(content)
  cleaned = cleaned.trimEnd()

  if (!peers || peers.length === 0) return cleaned + '\n'

  const peerTable = [
    '',
    PEER_DIR_BEGIN,
    '### 你的协作网络',
    '',
    '| Agent ID | 发消息命令 |',
    '|----------|-----------|',
    ...peers.map(p => `| ${p} | \`node skills/peer-status/scripts/peer-send.mjs --from ${agentId} --to ${p} --message "..."\` |`),
    '',
    '使用 `peer-send` 脚本发送跨 Agent 消息。**禁止**使用 `sessions_send` 跨 Agent 发消息。',
    PEER_DIR_END,
  ]

  return cleaned + peerTable.join('\n') + '\n'
}

// ── Base-rules injection (mirrors base-rules.ts) ─────────────────

const BASE_RULES_PATH = join(PROJECT_ROOT, 'config', 'base-rules.md')
const AGENTS_BEGIN = '<!-- BASE-RULES:BEGIN -->'
const AGENTS_END = '<!-- BASE-RULES:END -->'
const REMINDER_BEGIN = '<!-- BASE-RULES-REMINDER:BEGIN -->'
const REMINDER_END = '<!-- BASE-RULES-REMINDER:END -->'
const SOUL_BEGIN = '<!-- BASE-SOUL:BEGIN -->'
const SOUL_END = '<!-- BASE-SOUL:END -->'

function parseBaseRules(raw) {
  const sections = {}
  const sectionPattern = /^## (AGENTS_RULES|SOUL_RULES|REMINDER)\s*$/gm
  const matches = []
  let m
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

function stripMarkerBlock(content, startMarker, endMarker) {
  const startIdx = content.indexOf(startMarker)
  if (startIdx === -1) return content
  const endIdx = content.indexOf(endMarker, startIdx)
  if (endIdx === -1) return content
  const before = content.slice(0, startIdx)
  const after = content.slice(endIdx + endMarker.length)
  return (before + after.replace(/^\n{1,2}/, '\n')).replace(/^\n+/, '')
}

function injectIntoAgentsMd(content, agentsRules, reminder) {
  let cleaned = stripMarkerBlock(content, AGENTS_BEGIN, AGENTS_END)
  cleaned = stripMarkerBlock(cleaned, REMINDER_BEGIN, REMINDER_END)
  cleaned = cleaned.trim()
  const parts = []
  if (agentsRules) {
    parts.push(AGENTS_BEGIN)
    parts.push('# 强制执行协议\n')
    parts.push(agentsRules)
    parts.push(AGENTS_END)
    parts.push('')
  }
  parts.push(cleaned)
  if (reminder) {
    parts.push('')
    parts.push(REMINDER_BEGIN)
    parts.push('---')
    parts.push(reminder)
    parts.push(REMINDER_END)
  }
  return parts.join('\n') + '\n'
}

function injectIntoSoulMd(content, soulRules) {
  let cleaned = stripMarkerBlock(content, SOUL_BEGIN, SOUL_END)
  cleaned = cleaned.trim()
  const parts = []
  if (soulRules) {
    parts.push(SOUL_BEGIN)
    parts.push('## 底层信念\n')
    parts.push(soulRules)
    parts.push(SOUL_END)
    parts.push('')
  }
  parts.push(cleaned)
  return parts.join('\n') + '\n'
}

// ── Main migration ───────────────────────────────────────────────

function main() {
  console.log('=== Peer Status Migration ===\n')

  // Verify peer-status skill exists
  if (!existsSync(PEER_STATUS_SKILL_DIR)) {
    console.error('ERROR: skills/peer-status/ not found. Create the skill first.')
    process.exit(1)
  }

  // Read base rules
  let baseRules = null
  if (existsSync(BASE_RULES_PATH)) {
    baseRules = parseBaseRules(readFileSync(BASE_RULES_PATH, 'utf-8'))
    console.log('Loaded base-rules.md')
  }

  // Iterate all agents
  const agents = readdirSync(AGENTS_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory() && !d.name.startsWith('.'))

  for (const agentEntry of agents) {
    const agentId = agentEntry.name
    const agentDir = join(AGENTS_DIR, agentId)
    const agentJsonPath = join(agentDir, 'agent.json')

    if (!existsSync(agentJsonPath)) {
      console.log(`  SKIP ${agentId} — no agent.json`)
      continue
    }

    const config = JSON.parse(readFileSync(agentJsonPath, 'utf-8'))
    const peers = config.peers || []

    if (peers.length === 0) {
      console.log(`  SKIP ${agentId} — no peers`)
      continue
    }

    console.log(`\n  Processing ${agentId} (${peers.length} peers)...`)

    // 1. Add peer-status to skills if not already present
    const skills = config.skills || []
    if (!skills.includes('peer-status')) {
      skills.push('peer-status')
      config.skills = skills
      config.updatedAt = new Date().toISOString()
      writeFileSync(agentJsonPath, JSON.stringify(config, null, 2) + '\n')
      console.log(`    + Added peer-status to skills`)
    } else {
      console.log(`    - peer-status already in skills`)
    }

    // 2. Create symlink for peer-status skill
    const skillsDir = join(agentDir, 'skills')
    if (!existsSync(skillsDir)) mkdirSync(skillsDir, { recursive: true })
    const linkPath = join(skillsDir, 'peer-status')

    // Remove existing link if present
    try {
      if (existsSync(linkPath) && lstatSync(linkPath).isSymbolicLink()) {
        unlinkSync(linkPath)
      }
    } catch {}

    if (!existsSync(linkPath)) {
      try {
        symlinkSync(PEER_STATUS_SKILL_DIR, linkPath, 'dir')
        console.log(`    + Created symlink skills/peer-status`)
      } catch (e) {
        console.error(`    ! Failed to create symlink: ${e.message}`)
      }
    }

    // 3. Regenerate TOOLS.md
    writeFileSync(join(agentDir, 'TOOLS.md'), generateToolsMd(agentId, skills, agentDir))
    console.log(`    + Regenerated TOOLS.md`)

    // 4. Inject peer communication directory into AGENTS.md
    const agentsMdPath = join(agentDir, 'AGENTS.md')
    if (existsSync(agentsMdPath)) {
      let agentsMd = readFileSync(agentsMdPath, 'utf-8')

      // Strip existing base-rules markers for clean re-injection
      agentsMd = stripMarkerBlock(agentsMd, AGENTS_BEGIN, AGENTS_END)
      agentsMd = stripMarkerBlock(agentsMd, REMINDER_BEGIN, REMINDER_END)

      // Inject peer directory
      agentsMd = injectPeerDirectory(agentsMd, peers, agentId)

      // Re-inject base rules
      if (baseRules) {
        agentsMd = injectIntoAgentsMd(agentsMd, baseRules.agentsRules, baseRules.reminder)
      }

      writeFileSync(agentsMdPath, agentsMd)
      console.log(`    + Updated AGENTS.md with peer directory + base-rules`)
    }

    // 5. Re-inject soul rules
    if (baseRules) {
      const soulMdPath = join(agentDir, 'SOUL.md')
      if (existsSync(soulMdPath)) {
        const soulMd = readFileSync(soulMdPath, 'utf-8')
        writeFileSync(soulMdPath, injectIntoSoulMd(soulMd, baseRules.soulRules))
        console.log(`    + Re-injected SOUL.md base-rules`)
      }
    }
  }

  console.log('\n=== Migration complete ===')
}

main()
