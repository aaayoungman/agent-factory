import { NextResponse } from 'next/server'
import { fetchUsageData } from '@/lib/data-fetchers'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const params: Record<string, unknown> = {}
    if (searchParams.get('startDate')) params.startDate = searchParams.get('startDate')
    if (searchParams.get('endDate')) params.endDate = searchParams.get('endDate')
    if (searchParams.get('limit')) params.limit = Number(searchParams.get('limit'))

    const data = await fetchUsageData(Object.keys(params).length ? params : undefined)
    return NextResponse.json(data)
  } catch (e) {
    return NextResponse.json({ error: String(e), source: 'error' }, { status: 502 })
  }
}
