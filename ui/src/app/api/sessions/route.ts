import { NextResponse } from 'next/server'
import { gwCall } from '@/lib/gateway-client'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const params: Record<string, unknown> = {}
    if (searchParams.get('agentId')) params.agentId = searchParams.get('agentId')
    if (searchParams.get('limit')) params.limit = Number(searchParams.get('limit'))

    const result = gwCall('sessions.list', Object.keys(params).length ? params : undefined)
    return NextResponse.json({ ...(result as object), source: 'gateway' })
  } catch (e) {
    return NextResponse.json({ error: String(e), source: 'error' }, { status: 502 })
  }
}
