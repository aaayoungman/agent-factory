import { NextResponse } from 'next/server'
import { restartGateway } from '@/lib/gateway-manager'

export const dynamic = 'force-dynamic'

export async function POST() {
  const result = await restartGateway()
  return NextResponse.json(result, { status: result.ok ? 200 : 500 })
}
