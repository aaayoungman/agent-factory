import { NextRequest, NextResponse } from 'next/server'
import { execSync } from 'child_process'

export const dynamic = 'force-dynamic'

/**
 * POST /api/skills/install-bin — install a binary dependency via brew
 * Body: { bin: string }
 */
export async function POST(req: NextRequest) {
  try {
    const { bin } = await req.json() as { bin: string }

    if (!bin || !/^[a-zA-Z0-9_@\/-]+$/.test(bin)) {
      return NextResponse.json({ error: 'Invalid binary name' }, { status: 400 })
    }

    // Check if brew is available
    try {
      execSync('which brew', { encoding: 'utf-8', timeout: 5000 })
    } catch {
      return NextResponse.json({ ok: false, output: 'Homebrew is not installed. Visit https://brew.sh to install it.' }, { status: 400 })
    }

    const output = execSync(`brew install ${bin} 2>&1`, {
      encoding: 'utf-8',
      timeout: 120000,
      env: { ...process.env, HOMEBREW_NO_AUTO_UPDATE: '1' },
    }).trim()

    return NextResponse.json({ ok: true, output })
  } catch (e: any) {
    const output = e.stderr || e.stdout || e.message || 'Install failed'
    return NextResponse.json({ ok: false, output: String(output) }, { status: 500 })
  }
}
