import { NextResponse } from 'next/server'
import { stopGateway } from '@/lib/gateway-manager'

export const dynamic = 'force-dynamic'

export async function POST() {
  const result = await stopGateway()
  return NextResponse.json(result, { status: result.ok ? 200 : 500 })
}
