/**
 * Stall Detector — detect tasks/departments that are stuck
 */
const { loadDeptState } = require('./readers.cjs')
const logger = require('./logger.cjs')

/**
 * Detect stalled tasks in a department.
 *
 * A task is considered stalled if:
 * - It has been in 'in_progress' for 3+ consecutive cycles without progress change
 *
 * @param {string} deptId - Department ID
 * @returns {Array<{taskId: string, taskName: string, stalledCycles: number, suggestion: string}>}
 */
function detectStalls(deptId) {
  const state = loadDeptState(deptId)
  const history = state.history || []
  const stalls = []

  if (history.length < 3) return stalls

  // Analyze the last 3 cycles for patterns
  const recent = history.slice(-3)

  // Look for repeated task mentions in results without progress
  const taskMentions = {}
  for (const entry of recent) {
    const result = entry.result || ''
    // Extract task IDs/names mentioned in results
    const mentions = result.match(/\[([^\]]+)\]/g) || []
    for (const mention of mentions) {
      const taskRef = mention.replace(/[\[\]]/g, '')
      taskMentions[taskRef] = (taskMentions[taskRef] || 0) + 1
    }
  }

  // Tasks mentioned in all 3 recent cycles may be stalled
  for (const [taskRef, count] of Object.entries(taskMentions)) {
    if (count >= 3) {
      stalls.push({
        taskId: taskRef,
        taskName: taskRef,
        stalledCycles: count,
        suggestion: 'Task mentioned in 3+ consecutive cycles. Consider: reassigning, splitting into subtasks, or changing approach.',
      })
    }
  }

  if (stalls.length > 0) {
    logger.warn('stall-detector', `Detected ${stalls.length} stalled items in department ${deptId}`)
  }

  return stalls
}

/**
 * Detect stalled departments (no progress across cycles).
 *
 * A department is stalled if its recent cycle results are very similar.
 *
 * @param {string} deptId - Department ID
 * @returns {{stalled: boolean, reason?: string}}
 */
function detectDepartmentStall(deptId) {
  const state = loadDeptState(deptId)
  const history = state.history || []

  if (history.length < 3) return { stalled: false }

  const recent = history.slice(-3)

  // Check if cycle results are nearly identical (indicating no progress)
  const results = recent.map(h => h.result || '')
  if (results.every(r => r === results[0]) && results[0].length > 0) {
    return {
      stalled: true,
      reason: `Last 3 cycles produced identical results: "${results[0].slice(0, 100)}..."`,
    }
  }

  // Check if all recent cycles had errors
  const allErrors = recent.every(h => (h.result || '').startsWith('Error:'))
  if (allErrors) {
    return {
      stalled: true,
      reason: 'Last 3 cycles all resulted in errors',
    }
  }

  return { stalled: false }
}

module.exports = { detectStalls, detectDepartmentStall }
