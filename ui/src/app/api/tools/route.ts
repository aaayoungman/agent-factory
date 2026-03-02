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
    return NextResponse.json({ tools: config.tools || {} })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json()
    const { tools } = body as { tools: Record<string, unknown> }
    if (!tools || typeof tools !== 'object') {
      return NextResponse.json({ error: 'Missing or invalid "tools" field' }, { status: 400 })
    }

    const config = readOpenClawConfig()
    if (!config.tools || typeof config.tools !== 'object') {
      config.tools = {}
    }

    // Shallow merge: each top-level key in tools replaces entirely
    const existing = config.tools as Record<string, unknown>
    for (const [key, value] of Object.entries(tools)) {
      existing[key] = value
    }
    config.tools = existing

    writeFileSync(OPENCLAW_CONFIG_PATH, JSON.stringify(config, null, 2) + '\n')
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
