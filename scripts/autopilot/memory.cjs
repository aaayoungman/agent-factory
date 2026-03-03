/**
 * Memory — intelligent memory management for agents
 *
 * Replaces the 2000-char truncation with structured memory:
 * - SUMMARY.md: concise overview (~500 chars)
 * - decisions/YYYY-MM-DD.md: daily decision logs
 * - lessons/what-worked.md: accumulated strategy lessons
 */
const { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } = require('fs')
const { join } = require('path')
const { AGENTS_DIR } = require('./constants.cjs')
const logger = require('./logger.cjs')

/**
 * Build structured memory context for an agent.
 *
 * @param {string} agentId - Agent ID (e.g. 'ceo')
 * @param {string} cycleType - 'coordination' | 'strategy' | 'department'
 * @returns {object} { summary, recentDecisions, departmentStatus, lessonsLearned }
 */
function buildMemoryContext(agentId, cycleType) {
  const agentDir = join(AGENTS_DIR, agentId)
  const memoryDir = join(agentDir, 'memory')
  const result = {}

  // Always include summary
  const summaryPath = join(memoryDir, 'SUMMARY.md')
  if (existsSync(summaryPath)) {
    try {
      result.summary = readFileSync(summaryPath, 'utf-8').slice(0, 2000)
    } catch (err) {
      logger.debug('memory', `Failed to read SUMMARY.md for ${agentId}`, err)
    }
  }

  // Fall back to MEMORY.md if no SUMMARY.md
  if (!result.summary) {
    const memoryPath = join(agentDir, 'MEMORY.md')
    if (existsSync(memoryPath)) {
      try {
        const raw = readFileSync(memoryPath, 'utf-8')
        result.summary = extractSummaryFromMemory(raw)
      } catch (err) {
        logger.debug('memory', `Failed to read MEMORY.md for ${agentId}`, err)
      }
    }
  }

  // Recent decisions (last 7 days)
  if (cycleType === 'coordination' || cycleType === 'strategy') {
    const decisionsDir = join(memoryDir, 'decisions')
    if (existsSync(decisionsDir)) {
      try {
        const files = require('fs').readdirSync(decisionsDir)
          .filter(f => f.endsWith('.md'))
          .sort()
          .slice(-7) // Last 7 days
        let decisions = ''
        for (const f of files) {
          try {
            const content = readFileSync(join(decisionsDir, f), 'utf-8')
            decisions += `\n### ${f.replace('.md', '')}\n${content.slice(0, 500)}\n`
          } catch {}
        }
        if (decisions) result.recentDecisions = decisions.slice(0, 3000)
      } catch (err) {
        logger.debug('memory', `Failed to read decisions for ${agentId}`, err)
      }
    }
  }

  // Lessons learned (for strategy cycles)
  if (cycleType === 'strategy') {
    const lessonsPath = join(memoryDir, 'lessons', 'what-worked.md')
    if (existsSync(lessonsPath)) {
      try {
        result.lessonsLearned = readFileSync(lessonsPath, 'utf-8').slice(0, 2000)
      } catch (err) {
        logger.debug('memory', `Failed to read lessons for ${agentId}`, err)
      }
    }
  }

  return result
}

/**
 * Extract a concise summary from a raw MEMORY.md file.
 * Looks for ## sections and takes the most important ones.
 */
function extractSummaryFromMemory(raw) {
  if (!raw) return ''

  // Try to find key sections
  const sections = []
  const sectionRegex = /^##\s+(.+)$/gm
  let match
  while ((match = sectionRegex.exec(raw)) !== null) {
    sections.push({ title: match[1], start: match.index })
  }

  if (sections.length === 0) {
    return raw.slice(0, 2000)
  }

  // Priority sections to include
  const priorities = ['当前状态', '需要用户决策', '下轮关注', '本轮总结', '关键进展', 'Status', 'Current']
  let summary = ''

  for (const prio of priorities) {
    const section = sections.find(s => s.title.includes(prio))
    if (section) {
      const nextSection = sections.find(s => s.start > section.start)
      const end = nextSection ? nextSection.start : raw.length
      const content = raw.slice(section.start, end).trim()
      if (summary.length + content.length < 2000) {
        summary += content + '\n\n'
      }
    }
  }

  return summary || raw.slice(0, 2000)
}

/**
 * Compress memory after a successful cycle.
 * Extracts key decisions from the response and stores them.
 *
 * @param {string} agentId - Agent ID
 * @param {string} fullResponse - The full agent response text
 */
function compressMemory(agentId, fullResponse) {
  if (!fullResponse) return

  const agentDir = join(AGENTS_DIR, agentId)
  const memoryDir = join(agentDir, 'memory')

  // Ensure memory directories exist
  const dirs = [memoryDir, join(memoryDir, 'decisions'), join(memoryDir, 'lessons')]
  for (const dir of dirs) {
    if (!existsSync(dir)) {
      try { mkdirSync(dir, { recursive: true }) } catch (err) {
        logger.warn('memory', `Failed to create dir ${dir}`, err)
      }
    }
  }

  const today = new Date().toISOString().slice(0, 10)
  const timestamp = new Date().toISOString().slice(11, 19)

  // Append to daily decisions log
  const decisionsFile = join(memoryDir, 'decisions', `${today}.md`)
  try {
    const entry = extractDecisionEntry(fullResponse, timestamp)
    if (entry) {
      appendFileSync(decisionsFile, entry + '\n\n')
      logger.debug('memory', `Appended decision to ${decisionsFile}`)
    }
  } catch (err) {
    logger.warn('memory', 'Failed to write decision log', err)
  }

  // Update SUMMARY.md with latest status
  const summaryFile = join(memoryDir, 'SUMMARY.md')
  try {
    const summary = buildSummaryFromResponse(fullResponse, today)
    if (summary) {
      writeFileSync(summaryFile, summary)
      logger.debug('memory', `Updated SUMMARY.md for ${agentId}`)
    }
  } catch (err) {
    logger.warn('memory', 'Failed to update SUMMARY.md', err)
  }
}

/**
 * Extract a concise decision entry from an agent's response.
 */
function extractDecisionEntry(response, timestamp) {
  if (!response || response.length < 20) return null

  // Take first 300 chars as the decision summary
  const lines = response.split('\n').filter(l => l.trim())
  const summary = lines.slice(0, 5).join('\n')

  return `#### ${timestamp}\n${summary.slice(0, 500)}`
}

/**
 * Build a concise summary from the latest response.
 */
function buildSummaryFromResponse(response, date) {
  if (!response || response.length < 20) return null

  // Extract key information
  const lines = response.split('\n').filter(l => l.trim())
  const firstLines = lines.slice(0, 10).join('\n')

  return `# Agent Memory Summary\n\nLast updated: ${date}\n\n## 最新状态\n${firstLines.slice(0, 1000)}\n`
}

module.exports = { buildMemoryContext, compressMemory, extractSummaryFromMemory }
