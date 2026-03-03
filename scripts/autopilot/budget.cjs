/**
 * Budget — token usage tracking and daily limits
 */
const { readFileSync, existsSync } = require('fs')
const { BUDGET_FILE } = require('./constants.cjs')
const { loadDeptConfig, loadDeptState, saveDeptState } = require('./readers.cjs')
const logger = require('./logger.cjs')

/**
 * Load company-level budget config.
 */
function loadCompanyBudget() {
  if (!existsSync(BUDGET_FILE)) {
    return {
      company: {
        dailyTokenLimit: 5000000,
        monthlyTokenLimit: 100000000,
        alertThreshold: 0.8,
      },
      overBudgetAction: 'pause_and_notify',
    }
  }
  try {
    return JSON.parse(readFileSync(BUDGET_FILE, 'utf-8'))
  } catch (err) {
    logger.warn('budget', 'Failed to load budget config', err)
    return { company: { dailyTokenLimit: 5000000, alertThreshold: 0.8 }, overBudgetAction: 'pause_and_notify' }
  }
}

/**
 * Check if a department is within budget.
 *
 * @param {string} deptId - Department ID
 * @returns {{allowed: boolean, warning?: boolean, reason?: string, ratio: number}}
 */
function checkBudget(deptId) {
  const config = loadDeptConfig(deptId)
  if (!config || !config.budget || !config.budget.dailyTokenLimit) {
    return { allowed: true, ratio: 0 } // No budget = no limit
  }

  const state = loadDeptState(deptId)

  // Check if daily reset is needed
  if (shouldResetDaily(state.budgetResetAt)) {
    state.tokensUsedToday = 0
    state.budgetResetAt = new Date().toISOString()
    saveDeptState(deptId, state)
  }

  const ratio = state.tokensUsedToday / config.budget.dailyTokenLimit
  const threshold = config.budget.alertThreshold || 0.8

  if (ratio >= 1.0) {
    return { allowed: false, reason: 'daily budget exceeded', ratio }
  }
  if (ratio >= threshold) {
    return { allowed: true, warning: true, ratio }
  }
  return { allowed: true, ratio }
}

/**
 * Track token usage for a department after a cycle.
 *
 * @param {string} deptId - Department ID
 * @param {object} usage - Usage object from agent response { totalTokens, ... }
 */
function trackTokenUsage(deptId, usage) {
  const state = loadDeptState(deptId)
  const tokens = usage?.totalTokens || usage?.total_tokens || 0
  state.tokensUsedToday = (state.tokensUsedToday || 0) + tokens
  saveDeptState(deptId, state)
  logger.debug('budget', `Department ${deptId} used ${tokens} tokens (daily total: ${state.tokensUsedToday})`)
}

/**
 * Check if we need to reset the daily budget counter.
 */
function shouldResetDaily(lastResetAt) {
  if (!lastResetAt) return true
  const lastReset = new Date(lastResetAt)
  const now = new Date()
  return lastReset.toDateString() !== now.toDateString()
}

/**
 * Get budget summary across all departments.
 */
function getBudgetSummary() {
  const { readdirSync } = require('fs')
  const { join } = require('path')
  const { DEPARTMENTS_DIR } = require('./constants.cjs')

  const companyBudget = loadCompanyBudget()
  const departments = {}
  let totalUsed = 0

  if (existsSync(DEPARTMENTS_DIR)) {
    try {
      const dirs = readdirSync(DEPARTMENTS_DIR, { withFileTypes: true })
        .filter(d => d.isDirectory())
      for (const dir of dirs) {
        const config = loadDeptConfig(dir.name)
        const state = loadDeptState(dir.name)
        const limit = config?.budget?.dailyTokenLimit || 0
        const used = state.tokensUsedToday || 0
        departments[dir.name] = { limit, used, ratio: limit > 0 ? used / limit : 0 }
        totalUsed += used
      }
    } catch (err) {
      logger.warn('budget', 'Failed to build budget summary', err)
    }
  }

  return {
    company: {
      dailyLimit: companyBudget.company?.dailyTokenLimit || 0,
      used: totalUsed,
      ratio: companyBudget.company?.dailyTokenLimit
        ? totalUsed / companyBudget.company.dailyTokenLimit
        : 0,
    },
    departments,
  }
}

module.exports = { checkBudget, trackTokenUsage, loadCompanyBudget, getBudgetSummary, shouldResetDaily }
