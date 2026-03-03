/**
 * State management — loadState / saveState with atomic writes and concurrency guard
 */
const { readFileSync, writeFileSync, renameSync, existsSync } = require('fs')
const { STATE_FILE, DEFAULT_INTERVAL_SEC } = require('./constants.cjs')
const logger = require('./logger.cjs')

const DEFAULT_STATE = {
  status: 'stopped',
  pid: null,
  cycleCount: 0,
  lastCycleAt: null,
  lastCycleResult: null,
  intervalSeconds: DEFAULT_INTERVAL_SEC,
  history: [],
}

function loadState() {
  try {
    if (existsSync(STATE_FILE)) {
      return JSON.parse(readFileSync(STATE_FILE, 'utf-8'))
    }
  } catch (err) {
    logger.error('state', 'Failed to load state file', err)
  }
  return { ...DEFAULT_STATE }
}

/**
 * Atomic save: write to tmp file, then rename (atomic on most filesystems)
 */
function saveState(state) {
  const tmpFile = STATE_FILE + '.tmp'
  try {
    writeFileSync(tmpFile, JSON.stringify(state, null, 2))
    renameSync(tmpFile, STATE_FILE)
  } catch (err) {
    logger.error('state', 'Failed to save state file', err)
    // Fallback: direct write
    try {
      writeFileSync(STATE_FILE, JSON.stringify(state, null, 2))
    } catch (err2) {
      logger.error('state', 'Fallback save also failed', err2)
    }
  }
}

/**
 * Execute a function with exclusive state access (load → mutate → atomic save)
 */
async function withStateLock(fn) {
  const state = loadState()
  if (state._locked) {
    logger.warn('state', 'State is locked by another cycle, skipping')
    return null
  }
  state._locked = true
  saveState(state)
  try {
    const result = await fn(state)
    delete state._locked
    saveState(state)
    return result
  } catch (err) {
    delete state._locked
    saveState(state)
    throw err
  }
}

module.exports = { loadState, saveState, withStateLock, DEFAULT_STATE }
