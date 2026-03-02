import { NextResponse } from 'next/server'
import { fetchLogsData } from '@/lib/data-fetchers'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const data = await fetchLogsData()
    return NextResponse.json(data)
  } catch (e) {
    return NextResponse.json({ error: String(e), logs: [], source: 'error' }, { status: 502 })
  }
}
