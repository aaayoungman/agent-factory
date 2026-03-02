import { NextRequest, NextResponse } from 'next/server'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { resolve } from 'path'

const PROJECT_ROOT = resolve(process.cwd(), '..')
const OPENCLAW_CONFIG_PATH = resolve(PROJECT_ROOT, 'config/openclaw.json')

export const dynamic = 'force-dynamic'

function readOpenClawConfig(): Record<string, unknown> {
  if (!existsSync(OPENCLAW_CONFIG_PATH)) return {}
  return JSON.parse(readFileSync(OPENCLAW_CONFIG_PATH, 'utf-8'))
}

export async function GET() {
  try {
    const config = readOpenClawConfig()
    const agents = (config.agents || {}) as Record<string, unknown>
    const defaults = (agents.defaults || {}) as Record<string, unknown>
    return NextResponse.json({
      memorySearch: defaults.memorySearch || {},
      compaction: defaults.compaction || {},
    })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json()
    const { memorySearch, compaction } = body as {
      memorySearch?: Record<string, unknown>
      compaction?: Record<string, unknown>
    }

    const config = readOpenClawConfig()
    if (!config.agents || typeof config.agents !== 'object') {
      config.agents = {}
    }
    const agents = config.agents as Record<string, unknown>
    if (!agents.defaults || typeof agents.defaults !== 'object') {
      agents.defaults = {}
    }
    const defaults = agents.defaults as Record<string, unknown>

    if (memorySearch !== undefined) defaults.memorySearch = memorySearch
    if (compaction !== undefined) defaults.compaction = compaction

    writeFileSync(OPENCLAW_CONFIG_PATH, JSON.stringify(config, null, 2) + '\n')
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
