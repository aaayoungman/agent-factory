#!/usr/bin/env node
/**
 * Autopilot — 公司自主运营循环引擎
 *
 * 定期向 CEO 发送运营指令，CEO 自主决策并通过 subagent 委派团队执行。
 *
 * Usage:
 *   node scripts/autopilot.js                         # 运行一个循环
 *   node scripts/autopilot.js --loop                  # 持续循环模式
 *   node scripts/autopilot.js --loop --interval 1800  # 每 30 分钟循环
 *   node scripts/autopilot.js --stop                  # 停止运行中的循环
 */
const WebSocket = require('ws')
const { randomUUID } = require('crypto')
const { readFileSync, writeFileSync, existsSync } = require('fs')
const { resolve, join } = require('path')

const PROJECT_ROOT = resolve(__dirname, '..')
const CONFIG_DIR = join(PROJECT_ROOT, 'config')
const MISSION_FILE = join(CONFIG_DIR, 'mission.md')
const STATE_FILE = join(CONFIG_DIR, 'autopilot-state.json')
const TASKS_FILE = join(CONFIG_DIR, 'tasks.json')
const CEO_WORKSPACE = join(PROJECT_ROOT, 'agents/ceo')

// ── Parse CLI args ──────────────────────────────────────────────
const args = process.argv.slice(2)
const isLoop = args.includes('--loop')
const isStop = args.includes('--stop')
const intervalIdx = args.indexOf('--interval')
const intervalSec = intervalIdx >= 0 ? parseInt(args[intervalIdx + 1]) || 1800 : 1800

// ── State management ────────────────────────────────────────────
function loadState() {
  try {
    if (existsSync(STATE_FILE)) return JSON.parse(readFileSync(STATE_FILE, 'utf-8'))
  } catch {}
  return { status: 'stopped', pid: null, cycleCount: 0, lastCycleAt: null, lastCycleResult: null, intervalSeconds: intervalSec, history: [] }
}

function saveState(state) {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2))
}

// ── Handle --stop ───────────────────────────────────────────────
if (isStop) {
  const state = loadState()
  if (state.pid) {
    try { process.kill(state.pid, 'SIGTERM') } catch {}
    console.log(`Stopped autopilot (PID ${state.pid})`)
  }
  state.status = 'stopped'
  state.pid = null
  saveState(state)
  process.exit(0)
}

// ── Gateway config ──────────────────────────────────────────────
function getGatewayConfig() {
  const envPort = parseInt(process.env.AGENT_FACTORY_PORT || '0')
  const envToken = process.env.AGENT_FACTORY_TOKEN || ''
  const cfgPath = join(CONFIG_DIR, 'openclaw.json')
  if (existsSync(cfgPath)) {
    try {
      const cfg = JSON.parse(readFileSync(cfgPath, 'utf-8'))
      return {
        port: envPort || cfg.gateway?.port || 19100,
        token: envToken || cfg.gateway?.auth?.token || '',
      }
    } catch {}
  }
  return { port: envPort || 19100, token: envToken }
}

// ── Read mission & workspace state ──────────────────────────────
function readMission() {
  try { return readFileSync(MISSION_FILE, 'utf-8') } catch { return '(mission.md not found)' }
}

function readWorkspaceFile(filename) {
  try {
    const p = join(CEO_WORKSPACE, filename)
    if (existsSync(p)) return readFileSync(p, 'utf-8')
  } catch {}
  return null
}

// ── Read real project task data ──────────────────────────────────
function readProjectTasks() {
  const projectsDir = join(PROJECT_ROOT, 'projects')
  const results = []
  try {
    if (!existsSync(projectsDir)) return results
    const dirs = require('fs').readdirSync(projectsDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
    for (const dir of dirs) {
      const metaPath = join(projectsDir, dir.name, '.project-meta.json')
      if (!existsSync(metaPath)) continue
      try {
        const meta = JSON.parse(readFileSync(metaPath, 'utf-8'))
        results.push({ id: dir.name, ...meta })
      } catch {}
    }
  } catch {}
  return results
}

// ── Read standalone tasks from config/tasks.json ────────────────
function readStandaloneTasks() {
  try {
    if (!existsSync(TASKS_FILE)) return []
    const data = JSON.parse(readFileSync(TASKS_FILE, 'utf-8'))
    return data.tasks || []
  } catch { return [] }
}

// ── Read agent activity from session files ──────────────────────
function readAgentActivity() {
  const sessionsDir = join(PROJECT_ROOT, '.openclaw-state', 'agents')
  const activity = {}
  try {
    if (!existsSync(sessionsDir)) return activity
    const dirs = require('fs').readdirSync(sessionsDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
    for (const dir of dirs) {
      const sessFile = join(sessionsDir, dir.name, 'sessions', 'sessions.json')
      if (!existsSync(sessFile)) continue
      try {
        const stat = require('fs').statSync(sessFile)
        const sessions = JSON.parse(readFileSync(sessFile, 'utf-8'))
        let totalTokens = 0
        let latestUpdate = 0
        for (const [, sess] of Object.entries(sessions)) {
          if (sess && typeof sess === 'object') {
            totalTokens += sess.totalTokens || 0
            if (sess.updatedAt && sess.updatedAt > latestUpdate) latestUpdate = sess.updatedAt
          }
        }
        activity[dir.name] = {
          totalTokens,
          lastActive: latestUpdate || stat.mtimeMs,
          idleMins: Math.round((Date.now() - (latestUpdate || stat.mtimeMs)) / 60000),
        }
      } catch {}
    }
  } catch {}
  return activity
}

// ── Build CEO directive ─────────────────────────────────────────
function buildDirective(cycleNum) {
  const mission = readMission()
  const memory = readWorkspaceFile('MEMORY.md')

  // Gather real data
  const projects = readProjectTasks()
  const agentActivity = readAgentActivity()

  let context = `## 公司使命\n${mission}\n`

  if (memory) context += `\n## 你的上次记忆 (MEMORY.md)\n${memory.slice(0, 2000)}\n`

  // Build real project status with task details
  if (projects.length > 0) {
    context += `\n## 📊 项目实时数据（来自系统，非记忆）\n`
    for (const proj of projects) {
      const tasks = proj.tasks || []
      const completed = tasks.filter(t => t.status === 'completed').length
      const running = tasks.filter(t => t.status === 'running')
      const pending = tasks.filter(t => t.status !== 'completed' && t.status !== 'running')

      context += `\n### ${proj.name} (${proj.id})\n`
      context += `- 状态: ${proj.status} | 阶段: ${proj.currentPhase}/${proj.totalPhases}\n`
      context += `- 进度: ${completed}/${tasks.length} 任务完成\n`

      if (running.length > 0) {
        context += `- ⚡ 进行中:\n`
        for (const t of running) {
          const agentInfo = agentActivity[t.assignedAgent]
          const idle = agentInfo ? `（${agentInfo.idleMins} 分钟前活跃）` : '（无活动记录）'
          context += `  - [${t.id}] ${t.name} → ${t.assignedAgent} ${idle} (${t.progress}%)\n`
        }
      }
      if (pending.length > 0) {
        context += `- 🔲 待办:\n`
        for (const t of pending) {
          context += `  - [${t.id}] ${t.name} → 分配给 ${t.assignedAgent}\n`
        }
      }

      // Highlight if nearly done
      if (completed > 0 && completed >= tasks.length - 1) {
        context += `- 🚨 **项目接近完成！仅剩 ${tasks.length - completed} 个任务。必须主动推进收尾。**\n`
      }
    }
  }

  // Build standalone tasks section (user-created via Task Board)
  const standaloneTasks = readStandaloneTasks()
  const activeStandalone = standaloneTasks.filter(t => t.status !== 'completed')
  if (activeStandalone.length > 0) {
    context += `\n## 📋 独立任务（用户通过任务面板分配）\n`
    for (const t of activeStandalone) {
      const agents = (t.assignees || []).join(', ') || '未分配'
      context += `- [${t.id}] ${t.name} → ${agents} (${t.status}, ${t.priority || 'P1'}, ${t.progress || 0}%)\n`
      if (t.description) context += `  描述: ${t.description}\n`
    }
  }

  // Build agent availability dashboard
  const agentNames = Object.keys(agentActivity)
  if (agentNames.length > 0) {
    context += `\n## 👥 团队活动状态\n`
    const sorted = agentNames.sort((a, b) => (agentActivity[a].idleMins || 0) - (agentActivity[b].idleMins || 0))
    for (const name of sorted) {
      const a = agentActivity[name]
      const status = a.idleMins < 5 ? '🔴 忙碌' : a.idleMins < 30 ? '🟡 刚完成' : '🟢 空闲'
      context += `- ${name}: ${status}（${a.idleMins}分钟无活动, 累计 ${a.totalTokens} tokens）\n`
    }
  }

  return `[Autopilot Cycle #${cycleNum}]

你是 CEO，这是公司第 ${cycleNum} 轮自主运营循环。

${context}

## 本轮任务

⚠️ **禁止"等待"。每轮必须产出至少一个具体动作。**

请按以下步骤执行：

1. **读取上方实时数据**：查看项目任务状态和团队活动（这是系统实时数据，比你的记忆更准确）
2. **找到阻塞点**：哪些任务在"进行中"但实际没有进展？哪些任务应该开始但没人做？
3. **立即行动**：通过 subagent 调用团队成员执行。不要等别人汇报。
   - 市场分析 → 调用 analyst
   - 产品规划 → 调用 product
   - 项目管理/开发协调 → 调用 pm
   - 营销推广 → 调用 marketing
4. **更新 MEMORY.md**：记录本轮做了什么、发现了什么问题、下轮关注什么

## 行动原则

1. **主动驱动，禁止被动等待** — 如果某个任务分配给了某人但没进展，你必须重新委派或亲自推动
2. **接近完成时加速** — 项目只剩 1-2 个任务时，要全力冲刺收尾，不能放慢
3. **检测僵局** — 如果同一个任务连续 2 轮没进展，换一种方式推进（换 agent、拆分任务、调整目标）
4. **闭环确认** — 委派任务后，检查上一轮委派的任务是否有产出。没有产出 = 没完成
5. **完成即汇报** — 如果项目所有任务已完成，明确声明"项目已完成"并更新状态
6. **空闲 agent 要利用** — 查看团队活动状态，如果有 agent 长时间空闲，给他们分配工作

## 自主解决问题（重要！）

遇到外部依赖阻塞时（如需要 API Key、数据库、云服务等），**先自己想替代方案**，不要等用户：

- 需要数据库 → 用 SQLite / JSON 文件，不等 Supabase
- 需要 AI API Key → 先用 mock 数据做 UI 联调，标注"接入真实 API 后替换"
- 需要支付 → 先用 mock Stripe，标注 test mode
- 需要部署 → 先确保 localhost 能跑，写好部署文档
- 需要域名 → 用 localhost 或 Vercel 免费域名

**只有真正无法自主解决的问题才上报给用户。** 上报格式必须写在 MEMORY.md 的 \`## 🚨 需要用户决策\` 区块，格式如下：

\`\`\`
## 🚨 需要用户决策
- [问题描述] — [为什么 agent 无法自行解决] — [建议方案]
\`\`\`

系统会自动把这个区块展示在前端 UI 上通知用户。`
}

// ── Send message to CEO via WebSocket ───────────────────────────
function sendToCeo(message, timeoutMs = 300000) {
  return new Promise((resolve, reject) => {
    const config = getGatewayConfig()
    const runId = randomUUID()
    const sessionKey = 'agent:ceo:autopilot'
    let fullText = ''
    let done = false

    const finish = (result) => {
      if (done) return
      done = true
      clearTimeout(timer)
      try { ws.close() } catch {}
      resolve(result)
    }

    const timer = setTimeout(() => {
      if (!done) {
        done = true
        try { ws.close() } catch {}
        reject(new Error(`Timeout after ${timeoutMs / 1000}s`))
      }
    }, timeoutMs)

    const connectFrame = JSON.stringify({
      type: 'req', id: 'c', method: 'connect',
      params: {
        minProtocol: 3, maxProtocol: 3,
        client: { id: 'openclaw-control-ui', mode: 'backend', version: '1.0.0', platform: process.platform },
        caps: [],
        auth: { token: config.token },
        role: 'operator',
        scopes: ['operator.admin', 'operator.read', 'operator.write'],
      }
    })

    const ws = new WebSocket(`ws://127.0.0.1:${config.port}`, {
      headers: { Origin: `http://127.0.0.1:${config.port}` }
    })

    ws.on('message', (data) => {
      let f
      try { f = JSON.parse(data.toString()) } catch { return }

      if (f.type === 'event' && f.event === 'connect.challenge') {
        ws.send(connectFrame)
        return
      }

      if (f.type === 'res' && f.id === 'c') {
        if (f.ok) {
          ws.send(JSON.stringify({
            type: 'req', id: 's', method: 'chat.send',
            params: { sessionKey, message, idempotencyKey: runId }
          }))
        } else {
          finish({ ok: false, error: `Connect failed: ${f.error?.message}` })
        }
        return
      }

      if (f.type === 'res' && f.id === 's' && !f.ok) {
        finish({ ok: false, error: `chat.send failed: ${f.error?.message}` })
        return
      }

      if (f.type === 'event' && f.event === 'chat') {
        const p = f.payload
        if (!p || p.runId !== runId) return

        if (p.state === 'delta') {
          const text = p.message?.content
            ?.filter(b => b.type === 'text')
            ?.map(b => b.text || '')
            ?.join('') || ''
          if (text) fullText = text
        } else if (p.state === 'final') {
          const text = p.message?.content
            ?.filter(b => b.type === 'text')
            ?.map(b => b.text || '')
            ?.join('') || fullText
          finish({ ok: true, text, usage: p.usage })
        } else if (p.state === 'error') {
          finish({ ok: false, error: p.errorMessage || 'Agent error' })
        } else if (p.state === 'aborted') {
          finish({ ok: true, text: fullText, aborted: true })
        }
      }
    })

    ws.on('error', (err) => finish({ ok: false, error: `WebSocket: ${err.message}` }))
    ws.on('close', (code) => {
      if (!done) finish({ ok: false, error: `WebSocket closed (${code})` })
    })
  })
}

// ── Fetch real token usage from gateway session files ─────────
function fetchSessionTokens() {
  const sessionsDir = join(PROJECT_ROOT, '.openclaw-state', 'agents')
  const totals = { all: 0, byAgent: {} }
  try {
    if (!existsSync(sessionsDir)) return totals
    const agentDirs = require('fs').readdirSync(sessionsDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
    for (const dir of agentDirs) {
      const sessFile = join(sessionsDir, dir.name, 'sessions', 'sessions.json')
      if (!existsSync(sessFile)) continue
      try {
        const sessions = JSON.parse(readFileSync(sessFile, 'utf-8'))
        let agentTotal = 0
        for (const [, sess] of Object.entries(sessions)) {
          agentTotal += (sess && typeof sess === 'object' ? sess.totalTokens : 0) || 0
        }
        totals.byAgent[dir.name] = agentTotal
        totals.all += agentTotal
      } catch {}
    }
  } catch {}
  return totals
}

// ── Sync project state → projects/.project-meta.json ──
// Uses real data: CEO memory for phase, session files for tokens, task list for completion
function syncProjects(ceoResponseText) {
  const memory = readWorkspaceFile('MEMORY.md')
  const projectsDir = join(PROJECT_ROOT, 'projects')

  // Combine CEO memory + latest response for signal detection
  const signals = (memory || '') + '\n' + (ceoResponseText || '')

  try {
    if (!existsSync(projectsDir)) return
    const dirs = require('fs').readdirSync(projectsDir, { withFileTypes: true })
      .filter(d => d.isDirectory())

    for (const dir of dirs) {
      const metaPath = join(projectsDir, dir.name, '.project-meta.json')
      if (!existsSync(metaPath)) continue

      try {
        const meta = JSON.parse(readFileSync(metaPath, 'utf-8'))

        // Determine phase from CEO signals
        // BE CONSERVATIVE: Only adjust phase if explicitly stated, don't auto-increment
        // This prevents falsely moving to later phases based on incidental keywords
        let phase = meta.currentPhase || 1
        let status = meta.status || 'planning'

        // Only move to a NEW higher phase if explicitly stated (e.g., "进入阶段4")
        // Don't auto-detect phase from context keywords like "开发" or "Week" - that's too error-prone
        const explicitPhaseMatch = signals.match(/阶段[1-6]|Phase[1-6]/i)
        if (explicitPhaseMatch) {
          const phaseNum = parseInt(signals.match(/阶段(\d)|Phase(\d)/i)?.[1] || '1')
          if (phaseNum >= 1 && phaseNum <= 6) {
            phase = phaseNum
            status = phase >= 4 ? 'in-progress' : 'planning'
          }
        }

        // Update tasks based on phase progression only
        // BE CONSERVATIVE: Only auto-complete tasks from PREVIOUS phases
        // DO NOT auto-change pending → in_progress - that should be explicit
        if (meta.tasks) {
          for (const task of meta.tasks) {
            if (task.status === 'completed') continue
            // Only auto-complete tasks from previous phases
            if (task.phase < phase) {
              task.status = 'completed'
              task.progress = 100
              task.updatedAt = new Date().toISOString()
            }
            // DO NOT auto-mark current phase tasks as in_progress - keep pending as is
            // Let the CEO explicitly start tasks
          }

          // REMOVED: Aggressive completion pattern that was marking all tasks done incorrectly
          // The old code would match phrases like "项目收尾" and mark everything complete
          // Now we only rely on phase progression, not text patterns

          // Detect all-tasks-completed → project is completed (only if actually all done)
          const allDone = meta.tasks.length > 0 && meta.tasks.every(t => t.status === 'completed')
          const anyRunning = meta.tasks.some(t => t.status === 'in_progress')
          if (allDone) {
            status = 'completed'
            phase = meta.totalPhases || phase
            console.log(`🎉 Project ${dir.name} — all tasks completed!`)
          } else if (anyRunning) {
            status = 'in-progress'
          }
        }

        // Calculate tokens from gateway session files (real data)
        const sessionTokens = fetchSessionTokens()
        const assignedAgents = meta.assignedAgents || []
        let projectTokens = 0
        if (assignedAgents.length > 0) {
          for (const agentId of assignedAgents) {
            projectTokens += sessionTokens.byAgent[agentId] || 0
          }
        } else {
          projectTokens = sessionTokens.all
        }

        // Extract blockers from CEO memory "## 🚨 需要用户决策" section
        const blockers = []
        if (memory) {
          const blockerMatch = memory.match(/## 🚨 需要用户决策\n([\s\S]*?)(?=\n## |\n$|$)/)
          if (blockerMatch) {
            const lines = blockerMatch[1].trim().split('\n')
            for (const line of lines) {
              const cleaned = line.replace(/^[-*]\s*/, '').trim()
              if (cleaned.length > 0) blockers.push(cleaned)
            }
          }
        }

        meta.currentPhase = phase
        meta.status = status
        meta.tokensUsed = projectTokens
        meta.blockers = blockers
        meta.updatedAt = new Date().toISOString()

        writeFileSync(metaPath, JSON.stringify(meta, null, 2) + '\n')
        console.log(`📁 Synced project: ${dir.name} (phase ${phase}, ${status}, ${blockers.length} blockers)`)
      } catch {}
    }

    // Also copy new docs from agent workspaces to project docs/
    const ceoDocsDir = join(CEO_WORKSPACE, 'docs')
    const pmDocsDir = join(PROJECT_ROOT, 'agents/pm/docs')
    for (const dir of dirs) {
      const projDocsDir = join(projectsDir, dir.name, 'docs')
      if (!existsSync(projDocsDir)) continue
      for (const src of [ceoDocsDir, pmDocsDir]) {
        if (!existsSync(src)) continue
        try {
          const files = require('fs').readdirSync(src)
          for (const f of files) {
            const srcFile = join(src, f)
            const destFile = join(projDocsDir, f)
            if (!existsSync(destFile) || readFileSync(srcFile, 'utf-8') !== readFileSync(destFile, 'utf-8')) {
              writeFileSync(destFile, readFileSync(srcFile, 'utf-8'))
            }
          }
        } catch {}
      }
    }
  } catch (err) {
    console.error(`⚠️ Project sync error: ${err.message}`)
  }
}

// ── Run one cycle ───────────────────────────────────────────────
async function runCycle() {
  const state = loadState()
  state.cycleCount++
  state.status = 'cycling'
  state.lastCycleAt = new Date().toISOString()
  saveState(state)

  const cycleNum = state.cycleCount
  const startTime = Date.now()

  console.log(`\n══════════════════════════════════════════`)
  console.log(`  Autopilot Cycle #${cycleNum}`)
  console.log(`  ${new Date().toLocaleString()}`)
  console.log(`══════════════════════════════════════════\n`)

  const directive = buildDirective(cycleNum)
  console.log(`📤 Sending directive to CEO...\n`)

  try {
    const result = await sendToCeo(directive)
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)

    if (result.ok) {
      console.log(`✅ Cycle #${cycleNum} complete (${elapsed}s)\n`)
      console.log(`── CEO Response ──────────────────────────`)
      console.log(result.text)
      console.log(`──────────────────────────────────────────\n`)

      // Get real token counts from session files
      const sessionTokens = fetchSessionTokens()
      const ceoTokens = sessionTokens.byAgent['ceo'] || 0
      console.log(`📊 Tokens: CEO=${ceoTokens} Total=${sessionTokens.all}`)

      // Update state
      state.status = isLoop ? 'running' : 'stopped'
      state.lastCycleResult = result.text.slice(0, 500)
      state.history.push({
        cycle: cycleNum,
        startedAt: state.lastCycleAt,
        completedAt: new Date().toISOString(),
        elapsedSec: parseFloat(elapsed),
        result: result.text.slice(0, 300),
        tokens: sessionTokens.all,
      })
      // Keep last 50 cycles in history
      if (state.history.length > 50) state.history = state.history.slice(-50)
      saveState(state)

      // Sync project state with CEO response for completion detection
      try { syncProjects(result.text) } catch (e) { console.error(`⚠️ Project sync: ${e.message}`) }
    } else {
      console.error(`❌ Cycle #${cycleNum} failed: ${result.error}`)
      state.status = isLoop ? 'running' : 'error'
      state.lastCycleResult = `Error: ${result.error}`
      saveState(state)
    }
  } catch (err) {
    console.error(`❌ Cycle #${cycleNum} error: ${err.message}`)
    state.status = isLoop ? 'running' : 'error'
    state.lastCycleResult = `Error: ${err.message}`
    saveState(state)
  }
}

// ── Main ────────────────────────────────────────────────────────
async function main() {
  const state = loadState()
  state.pid = process.pid
  state.status = isLoop ? 'running' : 'cycling'
  state.intervalSeconds = intervalSec
  saveState(state)

  console.log(`🏢 Autopilot ${isLoop ? 'loop' : 'single cycle'} mode`)
  console.log(`   PID: ${process.pid}`)
  if (isLoop) console.log(`   Interval: ${intervalSec}s (${(intervalSec / 60).toFixed(0)}min)`)
  console.log(`   Mission: ${MISSION_FILE}`)
  console.log(`   State: ${STATE_FILE}\n`)

  // Graceful shutdown
  const shutdown = () => {
    console.log('\n🛑 Autopilot shutting down...')
    const s = loadState()
    s.status = 'stopped'
    s.pid = null
    saveState(s)
    process.exit(0)
  }
  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)

  // Run first cycle immediately
  await runCycle()

  // Loop mode
  if (isLoop) {
    console.log(`\n⏳ Next cycle in ${intervalSec}s...\n`)
    const loop = async () => {
      await runCycle()
      console.log(`\n⏳ Next cycle in ${intervalSec}s...\n`)
      setTimeout(loop, intervalSec * 1000)
    }
    setTimeout(loop, intervalSec * 1000)
  } else {
    const s = loadState()
    s.status = 'stopped'
    s.pid = null
    saveState(s)
  }
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})
