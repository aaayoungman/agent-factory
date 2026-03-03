/**
 * Orchestrator — manages CEO loop + all department loops
 *
 * Usage:
 *   node scripts/autopilot/orchestrator.cjs --loop
 *   node scripts/autopilot/orchestrator.cjs --stop
 */
const { existsSync, readdirSync, readFileSync } = require('fs')
const { join } = require('path')
const {
  DEPARTMENTS_DIR, AGENTS_DIR,
  CEO_COORDINATION_INTERVAL_SEC, CEO_STRATEGY_INTERVAL_SEC, DEFAULT_DEPT_INTERVAL_SEC,
} = require('./constants.cjs')
const { loadState, saveState } = require('./state.cjs')
const { sendToCeo } = require('./gateway.cjs')
const { buildDirective } = require('./directive.cjs')
const { buildMemoryContext, compressMemory } = require('./memory.cjs')
const { syncProjects } = require('./sync.cjs')
const { fetchSessionTokens } = require('./readers.cjs')
const { runDepartmentCycle } = require('./department-loop.cjs')
const { loadDeptConfig, loadDeptState } = require('./readers.cjs')
const logger = require('./logger.cjs')

const MAX_HISTORY = 50

/**
 * Discover active departments that have config + enabled + actual agent instances.
 */
function discoverActiveDepartments() {
  const results = []
  if (!existsSync(DEPARTMENTS_DIR)) return results

  try {
    const dirs = readdirSync(DEPARTMENTS_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory())

    for (const dir of dirs) {
      const configPath = join(DEPARTMENTS_DIR, dir.name, 'config.json')
      if (!existsSync(configPath)) continue

      try {
        const config = JSON.parse(readFileSync(configPath, 'utf-8'))
        if (!config.enabled) continue

        // Verify the department head agent actually exists
        const headDir = join(AGENTS_DIR, config.head)
        if (!existsSync(headDir)) {
          logger.warn('orchestrator', `Department ${dir.name} head ${config.head} not found, skipping`)
          continue
        }

        results.push({
          id: config.id || dir.name,
          head: config.head,
          interval: config.interval || DEFAULT_DEPT_INTERVAL_SEC,
          config,
        })
      } catch (err) {
        logger.warn('orchestrator', `Failed to parse config for dept ${dir.name}`, err)
      }
    }
  } catch (err) {
    logger.error('orchestrator', 'Failed to discover departments', err)
  }

  return results
}

/**
 * Run a CEO coordination cycle (reads dept reports, coordinates)
 */
async function runCeoCycle(cycleType = 'coordination') {
  const state = loadState()

  if (state.status === 'cycling') {
    logger.warn('orchestrator', 'CEO already cycling, skipping')
    return
  }

  state.cycleCount++
  state.status = 'cycling'
  state.lastCycleAt = new Date().toISOString()
  saveState(state)

  const cycleNum = state.cycleCount
  const startTime = Date.now()

  logger.info('orchestrator', `CEO ${cycleType} cycle #${cycleNum} started`)

  try {
    const memoryContext = buildMemoryContext('ceo', cycleType)
    const directive = buildDirective(cycleNum, cycleType, memoryContext)
    const result = await sendToCeo(directive)
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)

    if (result.ok) {
      logger.info('orchestrator', `CEO cycle #${cycleNum} completed in ${elapsed}s`)

      const sessionTokens = fetchSessionTokens()

      state.status = 'running'
      state.lastCycleResult = result.text.slice(0, 500)
      state.history = state.history || []
      state.history.push({
        cycle: cycleNum,
        startedAt: state.lastCycleAt,
        completedAt: new Date().toISOString(),
        elapsedSec: parseFloat(elapsed),
        result: result.text.slice(0, 300),
        tokens: sessionTokens.all,
        cycleType,
      })
      if (state.history.length > MAX_HISTORY) state.history = state.history.slice(-MAX_HISTORY)
      saveState(state)

      try { syncProjects(result.text) } catch (e) {
        logger.error('orchestrator', 'Project sync failed', e)
      }

      try { compressMemory('ceo', result.text) } catch (e) {
        logger.warn('orchestrator', 'Memory compression failed', e)
      }
    } else {
      logger.error('orchestrator', `CEO cycle #${cycleNum} failed: ${result.error}`)
      state.status = 'running'
      state.lastCycleResult = `Error: ${result.error}`
      saveState(state)
    }
  } catch (err) {
    logger.error('orchestrator', `CEO cycle #${cycleNum} error`, err)
    state.status = 'running'
    state.lastCycleResult = `Error: ${err.message}`
    saveState(state)
  }
}

/**
 * Start the full orchestrator: CEO cycles + department cycles.
 */
async function startOrchestrator() {
  const state = loadState()
  state.pid = process.pid
  state.status = 'running'
  state.mode = 'orchestrator'
  saveState(state)

  logger.info('orchestrator', `Orchestrator started (PID: ${process.pid})`)

  // Graceful shutdown
  const shutdown = () => {
    logger.info('orchestrator', 'Shutting down...')
    const s = loadState()
    s.status = 'stopped'
    s.pid = null
    s.mode = null
    saveState(s)
    process.exit(0)
  }
  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)

  // 1. Run initial CEO coordination cycle
  await runCeoCycle('coordination')

  // 2. Schedule recurring CEO coordination cycles
  const ceoCoordLoop = async () => {
    await runCeoCycle('coordination')
    setTimeout(ceoCoordLoop, CEO_COORDINATION_INTERVAL_SEC * 1000)
  }
  setTimeout(ceoCoordLoop, CEO_COORDINATION_INTERVAL_SEC * 1000)

  // 3. Schedule CEO strategy cycle (daily)
  const ceoStrategyLoop = async () => {
    await runCeoCycle('strategy')
    setTimeout(ceoStrategyLoop, CEO_STRATEGY_INTERVAL_SEC * 1000)
  }
  setTimeout(ceoStrategyLoop, CEO_STRATEGY_INTERVAL_SEC * 1000)

  // 4. Start department loops
  const departments = discoverActiveDepartments()
  logger.info('orchestrator', `Found ${departments.length} active departments`)

  for (const dept of departments) {
    logger.info('orchestrator', `Starting department loop: ${dept.id} (interval: ${dept.interval}s)`)

    // Run initial cycle
    await runDepartmentCycle(dept.id)

    // Schedule recurring cycles
    const deptLoop = async () => {
      await runDepartmentCycle(dept.id)
      setTimeout(deptLoop, dept.interval * 1000)
    }
    setTimeout(deptLoop, dept.interval * 1000)
  }

  logger.info('orchestrator', 'All loops scheduled. Running...')
}

module.exports = { startOrchestrator, discoverActiveDepartments, runCeoCycle }
