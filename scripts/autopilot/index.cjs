#!/usr/bin/env node
/**
 * Autopilot — 公司自主运营循环引擎（模块化版本）
 *
 * Usage:
 *   node scripts/autopilot/index.cjs                         # 运行一个循环
 *   node scripts/autopilot/index.cjs --loop                  # 持续循环模式
 *   node scripts/autopilot/index.cjs --loop --interval 1800  # 每 30 分钟循环
 *   node scripts/autopilot/index.cjs --stop                  # 停止运行中的循环
 *   node scripts/autopilot/index.cjs --orchestrator          # 启动编排器（CEO + 部门循环）
 */
const { DEFAULT_INTERVAL_SEC, MAX_HISTORY_ENTRIES, MAX_CYCLE_RESULT_LENGTH, MAX_HISTORY_RESULT_LENGTH } = require('./constants.cjs')
const { loadState, saveState } = require('./state.cjs')
const { sendToCeo } = require('./gateway.cjs')
const { fetchSessionTokens } = require('./readers.cjs')
const { buildDirective } = require('./directive.cjs')
const { syncProjects } = require('./sync.cjs')
const { buildMemoryContext, compressMemory } = require('./memory.cjs')
const logger = require('./logger.cjs')

// ── Parse CLI args ──────────────────────────────────────────────
const args = process.argv.slice(2)
const isLoop = args.includes('--loop')
const isStop = args.includes('--stop')
const isOrchestrator = args.includes('--orchestrator')
const intervalIdx = args.indexOf('--interval')
const intervalSec = intervalIdx >= 0 ? parseInt(args[intervalIdx + 1]) || DEFAULT_INTERVAL_SEC : DEFAULT_INTERVAL_SEC

// ── Handle --stop ───────────────────────────────────────────────
if (isStop) {
  const state = loadState()
  if (state.pid) {
    try { process.kill(state.pid, 'SIGTERM') } catch (err) {
      logger.warn('main', `Failed to kill PID ${state.pid}`, err)
    }
    console.log(`Stopped autopilot (PID ${state.pid})`)
  }
  state.status = 'stopped'
  state.pid = null
  saveState(state)
  process.exit(0)
}

// ── Handle --orchestrator ───────────────────────────────────────
if (isOrchestrator) {
  const { startOrchestrator } = require('./orchestrator.cjs')
  startOrchestrator().catch(err => {
    logger.error('main', 'Orchestrator failed', err)
    process.exit(1)
  })
} else {
  // Standard CEO-only mode
  main().catch(err => {
    logger.error('main', 'Fatal error', err)
    process.exit(1)
  })
}

// ── Run one cycle ───────────────────────────────────────────────
async function runCycle() {
  const state = loadState()

  // Concurrency guard
  if (state.status === 'cycling') {
    logger.warn('main', 'Another cycle is already running, skipping')
    return
  }

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

  // Build memory context (structured, replaces the 2000-char truncation)
  let memoryContext = null
  try {
    memoryContext = buildMemoryContext('ceo', 'coordination')
  } catch (err) {
    logger.warn('main', 'Failed to build memory context, falling back to raw', err)
  }

  const directive = buildDirective(cycleNum, 'coordination', memoryContext)
  console.log(`📤 Sending directive to CEO...\n`)
  logger.info('main', `Cycle #${cycleNum} started`)

  try {
    const result = await sendToCeo(directive)
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)

    if (result.ok) {
      console.log(`✅ Cycle #${cycleNum} complete (${elapsed}s)\n`)
      console.log(`── CEO Response ──────────────────────────`)
      console.log(result.text)
      console.log(`──────────────────────────────────────────\n`)

      const sessionTokens = fetchSessionTokens()
      const ceoTokens = sessionTokens.byAgent['ceo'] || 0
      console.log(`📊 Tokens: CEO=${ceoTokens} Total=${sessionTokens.all}`)

      // Update state
      state.status = isLoop ? 'running' : 'stopped'
      state.lastCycleResult = result.text.slice(0, MAX_CYCLE_RESULT_LENGTH)
      state.history.push({
        cycle: cycleNum,
        startedAt: state.lastCycleAt,
        completedAt: new Date().toISOString(),
        elapsedSec: parseFloat(elapsed),
        result: result.text.slice(0, MAX_HISTORY_RESULT_LENGTH),
        tokens: sessionTokens.all,
      })
      if (state.history.length > MAX_HISTORY_ENTRIES) {
        state.history = state.history.slice(-MAX_HISTORY_ENTRIES)
      }
      saveState(state)

      // Sync project state
      try {
        syncProjects(result.text)
      } catch (e) {
        logger.error('main', `Project sync failed`, e)
      }

      // Compress CEO memory after successful cycle
      try {
        compressMemory('ceo', result.text)
      } catch (e) {
        logger.warn('main', 'Memory compression failed', e)
      }

      logger.info('main', `Cycle #${cycleNum} completed in ${elapsed}s`)
    } else {
      logger.error('main', `Cycle #${cycleNum} failed: ${result.error}`)
      state.status = isLoop ? 'running' : 'error'
      state.lastCycleResult = `Error: ${result.error}`
      saveState(state)
    }
  } catch (err) {
    logger.error('main', `Cycle #${cycleNum} error: ${err.message}`, err)
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
  console.log()

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

module.exports = { runCycle, main }
