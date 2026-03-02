import { NextRequest, NextResponse } from 'next/server'
import { install, update, uninstall, listInstalled } from '@/lib/clawhub'

export const dynamic = 'force-dynamic'

/**
 * GET /api/skills/manage — list installed skills (from clawhub lockfile)
 */
export async function GET() {
  try {
    const installed = listInstalled()
    return NextResponse.json({ installed, source: 'clawhub' })
  } catch (e) {
    return NextResponse.json({ error: String(e), installed: [] }, { status: 500 })
  }
}

/**
 * POST /api/skills/manage — install, update, or uninstall a skill
 *
 * Body: { action: 'install' | 'update' | 'uninstall', slug: string, version?: string }
 */
export async function POST(req: NextRequest) {
  try {
    const { action, slug, version } = await req.json() as {
      action: 'install' | 'update' | 'update-all' | 'uninstall'
      slug?: string
      version?: string
    }

    if (!action) {
      return NextResponse.json({ error: 'action required' }, { status: 400 })
    }

    switch (action) {
      case 'install': {
        if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 })
        const result = install(slug, version)
        return NextResponse.json(result)
      }
      case 'update': {
        const result = update(slug)
        return NextResponse.json(result)
      }
      case 'update-all': {
        const result = update()
        return NextResponse.json(result)
      }
      case 'uninstall': {
        if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 })
        const result = uninstall(slug)
        return NextResponse.json(result)
      }
      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    }
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
