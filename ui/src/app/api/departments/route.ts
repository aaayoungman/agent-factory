import { NextRequest, NextResponse } from 'next/server'
import { readDepartments, writeDepartments } from '@/lib/department-meta'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'

export const dynamic = 'force-dynamic'

const PROJECT_ROOT = resolve(process.cwd(), '..')
const AGENTS_DIR = join(PROJECT_ROOT, 'agents')

/** GET — list all departments */
export async function GET() {
  try {
    const departments = readDepartments()
    return NextResponse.json({ departments })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

/** POST — create a new department */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { id, name, nameEn, emoji, order, floorColor, furniture } = body

    if (!id || !name || !nameEn) {
      return NextResponse.json({ error: 'id, name, and nameEn are required' }, { status: 400 })
    }
    if (!/^[a-z0-9-]+$/.test(id)) {
      return NextResponse.json({ error: 'ID must be lowercase alphanumeric with hyphens' }, { status: 400 })
    }

    const departments = readDepartments()
    if (departments.find(d => d.id === id)) {
      return NextResponse.json({ error: `Department "${id}" already exists` }, { status: 409 })
    }

    departments.push({
      id,
      name,
      nameEn,
      emoji: emoji || '🏢',
      order: order ?? departments.length,
      floorColor: floorColor || { h: 35, s: 30, b: 15, c: 0 },
      furniture: furniture || [],
    })

    departments.sort((a, b) => a.order - b.order)
    writeDepartments(departments)

    return NextResponse.json({ ok: true, id })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

/** PUT — update a department */
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json()
    const { id, ...updates } = body

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }

    const departments = readDepartments()
    const idx = departments.findIndex(d => d.id === id)
    if (idx === -1) {
      return NextResponse.json({ error: `Department "${id}" not found` }, { status: 404 })
    }

    if (updates.name !== undefined) departments[idx].name = updates.name
    if (updates.nameEn !== undefined) departments[idx].nameEn = updates.nameEn
    if (updates.emoji !== undefined) departments[idx].emoji = updates.emoji
    if (updates.order !== undefined) departments[idx].order = updates.order
    if (updates.floorColor !== undefined) departments[idx].floorColor = updates.floorColor
    if (updates.furniture !== undefined) departments[idx].furniture = updates.furniture

    departments.sort((a, b) => a.order - b.order)
    writeDepartments(departments)

    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

/** DELETE — remove a department (agents become unassigned) */
export async function DELETE(req: NextRequest) {
  try {
    const { id } = await req.json()
    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }

    const departments = readDepartments()
    const idx = departments.findIndex(d => d.id === id)
    if (idx === -1) {
      return NextResponse.json({ error: `Department "${id}" not found` }, { status: 404 })
    }

    // Check if any agents are in this department
    const agentCount = countAgentsInDepartment(id)
    if (agentCount > 0) {
      // Clear department from agents instead of blocking
      clearDepartmentFromAgents(id)
    }

    departments.splice(idx, 1)
    writeDepartments(departments)

    return NextResponse.json({ ok: true, clearedAgents: agentCount })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

function countAgentsInDepartment(deptId: string): number {
  let count = 0
  if (!existsSync(AGENTS_DIR)) return 0
  for (const entry of readdirSync(AGENTS_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const agentJsonPath = join(AGENTS_DIR, entry.name, 'agent.json')
    if (!existsSync(agentJsonPath)) continue
    try {
      const data = JSON.parse(readFileSync(agentJsonPath, 'utf-8'))
      if (data.department === deptId) count++
    } catch { /* skip */ }
  }
  return count
}

function clearDepartmentFromAgents(deptId: string): void {
  if (!existsSync(AGENTS_DIR)) return
  for (const entry of readdirSync(AGENTS_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const agentJsonPath = join(AGENTS_DIR, entry.name, 'agent.json')
    if (!existsSync(agentJsonPath)) continue
    try {
      const data = JSON.parse(readFileSync(agentJsonPath, 'utf-8'))
      if (data.department === deptId) {
        delete data.department
        writeFileSync(agentJsonPath, JSON.stringify(data, null, 2) + '\n')
      }
    } catch { /* skip */ }
  }
}
