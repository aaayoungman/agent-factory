import { NextResponse } from 'next/server'
import { getStatus } from '@/lib/gateway-manager'

export const dynamic = 'force-dynamic'

export async function GET() {
  const status = await getStatus()
  return NextResponse.json(status)
}
