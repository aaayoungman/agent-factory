import { NextRequest, NextResponse } from 'next/server'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { resolve } from 'path'

export const dynamic = 'force-dynamic'

const PROJECT_ROOT = resolve(process.cwd(), '..')
const ENV_PATH = resolve(PROJECT_ROOT, '.env')

interface EnvEntry {
  key: string
  value: string
}

function readEnv(): Record<string, string> {
  if (!existsSync(ENV_PATH)) return {}
  const vars: Record<string, string> = {}
  const lines = readFileSync(ENV_PATH, 'utf-8').split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) continue
    vars[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim()
  }
  return vars
}

function writeEnv(vars: Record<string, string>) {
  // Preserve comments from existing file
  const comments: string[] = []
  if (existsSync(ENV_PATH)) {
    const lines = readFileSync(ENV_PATH, 'utf-8').split('\n')
    for (const line of lines) {
      if (line.trim().startsWith('#') || line.trim() === '') {
        comments.push(line)
      }
    }
  }

  const lines: string[] = []
  if (comments.length) {
    lines.push(...comments)
    if (comments[comments.length - 1]?.trim() !== '') lines.push('')
  }

  for (const [key, value] of Object.entries(vars)) {
    lines.push(`${key}=${value}`)
  }

  writeFileSync(ENV_PATH, lines.join('\n') + '\n')

  // Also update process.env so gateway-manager picks it up immediately
  for (const [key, value] of Object.entries(vars)) {
    process.env[key] = value
  }
}

// GET: return env keys (masked values)
export async function GET() {
  const vars = readEnv()
  const masked: Record<string, string> = {}
  for (const [key, value] of Object.entries(vars)) {
    if (key.includes('KEY') || key.includes('TOKEN') || key.includes('SECRET')) {
      masked[key] = value ? `${value.slice(0, 8)}...${value.slice(-4)}` : ''
    } else {
      masked[key] = value
    }
  }
  return NextResponse.json({ vars: masked, hasFile: existsSync(ENV_PATH) })
}

// PUT: upsert env vars
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json()
    const entries: EnvEntry[] = body.entries || []

    const current = readEnv()
    for (const { key, value } of entries) {
      if (!key.match(/^[A-Z_][A-Z0-9_]*$/)) {
        return NextResponse.json({ error: `Invalid key: ${key}` }, { status: 400 })
      }
      if (value) {
        current[key] = value
      } else {
        delete current[key]
      }
    }

    writeEnv(current)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
