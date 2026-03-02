import { NextRequest, NextResponse } from 'next/server'
import { execSync } from 'child_process'
import { resolve } from 'path'
import { existsSync, readFileSync } from 'fs'
import { restartGateway, getStatus } from '@/lib/gateway-manager'

export const dynamic = 'force-dynamic'

const PROJECT_ROOT = resolve(process.cwd(), '..')

function getInstalledVersion(): string | null {
  try {
    const openclawBin = resolve(PROJECT_ROOT, 'node_modules/.bin/openclaw')
    if (!existsSync(openclawBin)) return null
    return execSync(`${openclawBin} --version 2>/dev/null || echo unknown`, { cwd: PROJECT_ROOT, timeout: 10000 })
      .toString().trim()
  } catch {
    // Fallback: use npm list to get version
    try {
      const output = execSync('npm list openclaw --depth=0 --json 2>/dev/null', {
        cwd: PROJECT_ROOT,
        timeout: 10000
      }).toString()
      const info = JSON.parse(output)
      return info.dependencies?.openclaw?.version || null
    } catch { return null }
  }
}

function getLatestVersion(): string | null {
  try {
    return execSync('npm view openclaw version 2>/dev/null', { timeout: 15000 })
      .toString().trim()
  } catch { return null }
}

function getChangelog(): string | null {
  try {
    // Try npm view for recent changes
    const info = execSync('npm view openclaw --json 2>/dev/null', { timeout: 15000 }).toString()
    const parsed = JSON.parse(info)
    // Return description or last few version tags as a simple changelog
    const versions = parsed['dist-tags'] || {}
    return JSON.stringify(versions)
  } catch { return null }
}

// GET: check current + latest version
export async function GET() {
  const current = getInstalledVersion()
  const latest = getLatestVersion()
  const hasUpdate = !!(current && latest && current !== latest && current !== 'unknown')

  return NextResponse.json({
    current: current || 'unknown',
    latest: latest || 'unknown',
    hasUpdate,
    checkedAt: new Date().toISOString(),
  })
}

// POST: perform update
export async function POST(req: NextRequest) {
  try {
    const current = getInstalledVersion()

    // Install latest version (npm update won't catch prerelease tags)
    const output = execSync('npm install openclaw@latest 2>&1', {
      cwd: PROJECT_ROOT,
      timeout: 120000,
      env: { ...process.env },
    }).toString()

    const newVersion = getInstalledVersion()
    const updated = current !== newVersion

    // Auto-restart gateway if updated and currently running
    let restarted = false
    if (updated) {
      const status = await getStatus()
      if (status.status === 'running') {
        const restartResult = await restartGateway()
        restarted = restartResult.ok
      }
    }

    return NextResponse.json({
      ok: true,
      previousVersion: current,
      currentVersion: newVersion,
      updated,
      restarted,
      output: output.slice(-1000),
    })
  } catch (e: any) {
    return NextResponse.json({
      ok: false,
      error: e.message || 'Update failed',
      output: e.stdout?.toString()?.slice(-500) || e.stderr?.toString()?.slice(-500) || '',
    }, { status: 500 })
  }
}
