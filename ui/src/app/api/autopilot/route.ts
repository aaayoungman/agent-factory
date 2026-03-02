import { NextResponse } from 'next/server'
import { spawn } from 'child_process'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { resolve, join } from 'path'

export const dynamic = 'force-dynamic'

const PROJECT_ROOT = resolve(process.cwd(), '..')
const STATE_FILE = join(PROJECT_ROOT, 'config/autopilot-state.json')
const MISSION_FILE = join(PROJECT_ROOT, 'config/mission.md')
const AUTOPILOT_SCRIPT = join(PROJECT_ROOT, 'scripts/autopilot.cjs')

interface AutopilotState {
  status: 'running' | 'stopped' | 'cycling' | 'error'
  pid: number | null
  cycleCount: number
  lastCycleAt: string | null
  lastCycleResult: string | null
  intervalSeconds: number
  history: Array<{
    cycle: number
    startedAt: string
    completedAt: string
    elapsedSec: number
    result: string
    tokens: number
  }>
}

function loadState(): AutopilotState {
  try {
    if (existsSync(STATE_FILE)) return JSON.parse(readFileSync(STATE_FILE, 'utf-8'))
  } catch {}
  return {
    status: 'stopped', pid: null, cycleCount: 0,
    lastCycleAt: null, lastCycleResult: null,
    intervalSeconds: 1800, history: [],
  }
}

function saveState(state: AutopilotState) {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2))
}

function isProcessRunning(pid: number): boolean {
  try { process.kill(pid, 0); return true } catch { return false }
}

/**
 * GET /api/autopilot — Get autopilot status
 */
export async function GET() {
  const state = loadState()

  // Verify PID is actually running
  if (state.pid && !isProcessRunning(state.pid)) {
    state.status = 'stopped'
    state.pid = null
    saveState(state)
  }

  // Read mission summary
  let missionSummary = ''
  try {
    if (existsSync(MISSION_FILE)) {
      const content = readFileSync(MISSION_FILE, 'utf-8')
      // First 3 non-empty lines
      missionSummary = content.split('\n').filter(l => l.trim()).slice(0, 3).join('\n')
    }
  } catch {}

  return NextResponse.json({
    ...state,
    missionSummary,
    recentHistory: state.history.slice(-10),
  })
}

/**
 * POST /api/autopilot — Control autopilot
 * Body: { action: 'start' | 'stop' | 'cycle', interval?: number }
 */
export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { action, interval } = body
    const state = loadState()

    if (action === 'stop') {
      if (state.pid) {
        try { process.kill(state.pid, 'SIGTERM') } catch {}
      }
      state.status = 'stopped'
      state.pid = null
      saveState(state)
      return NextResponse.json({ ok: true, message: 'Autopilot stopped' })
    }

    if (action === 'cycle') {
      // Run single cycle in background
      const child = spawn('node', [AUTOPILOT_SCRIPT], {
        cwd: PROJECT_ROOT,
        detached: true,
        stdio: 'ignore',
        env: { ...process.env },
      })
      child.unref()
      return NextResponse.json({ ok: true, message: 'Single cycle started', pid: child.pid })
    }

    if (action === 'start') {
      // Stop existing if running
      if (state.pid && isProcessRunning(state.pid)) {
        try { process.kill(state.pid, 'SIGTERM') } catch {}
        // Give it a moment to clean up
        await new Promise(r => setTimeout(r, 1000))
      }

      const intervalArg = String(interval || state.intervalSeconds || 1800)
      const child = spawn('node', [AUTOPILOT_SCRIPT, '--loop', '--interval', intervalArg], {
        cwd: PROJECT_ROOT,
        detached: true,
        stdio: 'ignore',
        env: { ...process.env },
      })
      child.unref()

      state.status = 'running'
      state.pid = child.pid || null
      state.intervalSeconds = parseInt(intervalArg)
      saveState(state)

      return NextResponse.json({
        ok: true,
        message: `Autopilot started (PID ${child.pid}, interval ${intervalArg}s)`,
        pid: child.pid,
      })
    }

    return NextResponse.json({ ok: false, error: `Unknown action: ${action}` }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 })
  }
}
