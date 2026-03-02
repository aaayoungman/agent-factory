import { NextResponse } from 'next/server'
import { fetchHealthData } from '@/lib/data-fetchers'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const data = await fetchHealthData()
    return NextResponse.json(data)
  } catch (e) {
    return NextResponse.json({ error: String(e), source: 'error' }, { status: 502 })
  }
}
