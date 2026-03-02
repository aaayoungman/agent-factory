import { NextResponse } from 'next/server'
import { startGateway } from '@/lib/gateway-manager'

export const dynamic = 'force-dynamic'

export async function POST() {
  const result = await startGateway()
  return NextResponse.json(result, { status: result.ok ? 200 : 500 })
}
