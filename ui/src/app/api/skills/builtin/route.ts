import { NextResponse } from 'next/server'
import { execSync } from 'child_process'
import { resolve } from 'path'

export const dynamic = 'force-dynamic'

const PROJECT_ROOT = resolve(process.cwd(), '..')

export async function GET() {
  try {
    const openclawBin = resolve(PROJECT_ROOT, 'node_modules/.bin/openclaw')
    const raw = execSync(`"${openclawBin}" skills list --json`, {
      timeout: 15000,
      encoding: 'utf-8',
      cwd: PROJECT_ROOT,
      env: { ...process.env, NO_COLOR: '1' },
    }).trim()

    const parsed = JSON.parse(raw) as {
      skills: Array<{
        name: string
        description: string
        emoji: string
        eligible: boolean
        disabled: boolean
        bundled: boolean
        homepage?: string
        missing: {
          bins: string[]
          anyBins: string[]
          env: string[]
          config: string[]
          os: string[]
        }
      }>
    }

    const allSkills = parsed.skills || []
    const bundled = allSkills.filter(s => s.bundled)
    const eligible = bundled.filter(s => s.eligible).length

    return NextResponse.json({ skills: bundled, total: bundled.length, eligible })
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message || 'Failed to list builtin skills', skills: [], total: 0, eligible: 0 },
      { status: 500 },
    )
  }
}
