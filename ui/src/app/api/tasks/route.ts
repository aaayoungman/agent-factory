import { NextRequest, NextResponse } from 'next/server'
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'fs'
import { join, resolve } from 'path'
import type { Task } from '@/lib/types'

export const dynamic = 'force-dynamic'

const PROJECT_ROOT = resolve(process.cwd(), '..')
const PROJECTS_DIR = join(PROJECT_ROOT, 'projects')
const TASKS_FILE = join(PROJECT_ROOT, 'config', 'tasks.json')

// ── Helpers ─────────────────────────────────────────────────────

/** Normalize legacy task fields to new Task shape */
function normalizeTask(raw: Record<string, unknown>, projectId?: string): Task {
  const assignees: string[] = Array.isArray(raw.assignees)
    ? raw.assignees as string[]
    : typeof raw.assignedAgent === 'string' && raw.assignedAgent
      ? [raw.assignedAgent as string]
      : []

  // Map legacy 'running' status to 'in_progress'
  let status = (raw.status as string) || 'pending'
  if (status === 'running') status = 'in_progress'

  return {
    id: raw.id as string,
    name: raw.name as string,
    description: (raw.description as string) || undefined,
    projectId: projectId ?? (raw.projectId as string | null) ?? null,
    phase: (raw.phase as number) || undefined,
    status: status as Task['status'],
    priority: (raw.priority as Task['priority']) || 'P1',
    assignees,
    assignedAgent: assignees[0] || undefined,
    creator: (raw.creator as string) || 'user',
    progress: (raw.progress as number) || 0,
    dependencies: (raw.dependencies as string[]) || [],
    output: (raw.output as string) || undefined,
    tags: (raw.tags as string[]) || undefined,
    createdAt: (raw.createdAt as string) || new Date().toISOString(),
    updatedAt: (raw.updatedAt as string) || new Date().toISOString(),
    completedAt: (raw.completedAt as string) || undefined,
  }
}

/** Read standalone tasks from config/tasks.json */
function readStandaloneTasks(): Task[] {
  try {
    if (!existsSync(TASKS_FILE)) return []
    const data = JSON.parse(readFileSync(TASKS_FILE, 'utf-8'))
    return (data.tasks || []).map((t: Record<string, unknown>) => normalizeTask(t))
  } catch {
    return []
  }
}

/** Write standalone tasks to config/tasks.json */
function writeStandaloneTasks(tasks: Task[]) {
  const dir = join(PROJECT_ROOT, 'config')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(TASKS_FILE, JSON.stringify({ tasks, lastUpdated: new Date().toISOString() }, null, 2) + '\n')
}

/** Read all project tasks from project meta files */
function readProjectTasks(): Task[] {
  const tasks: Task[] = []
  try {
    if (!existsSync(PROJECTS_DIR)) return tasks
    const dirs = readdirSync(PROJECTS_DIR, { withFileTypes: true }).filter(d => d.isDirectory())
    for (const dir of dirs) {
      const metaPath = join(PROJECTS_DIR, dir.name, '.project-meta.json')
      if (!existsSync(metaPath)) continue
      try {
        const meta = JSON.parse(readFileSync(metaPath, 'utf-8'))
        const projectTasks = (meta.tasks || []) as Record<string, unknown>[]
        for (const t of projectTasks) {
          tasks.push(normalizeTask(t, dir.name))
        }
      } catch { /* skip corrupt meta */ }
    }
  } catch { /* skip */ }
  return tasks
}

/** Update a task in a project's .project-meta.json */
function updateProjectTask(projectId: string, taskId: string, updates: Partial<Task>): boolean {
  const metaPath = join(PROJECTS_DIR, projectId, '.project-meta.json')
  if (!existsSync(metaPath)) return false
  try {
    const meta = JSON.parse(readFileSync(metaPath, 'utf-8'))
    const tasks = (meta.tasks || []) as Record<string, unknown>[]
    const idx = tasks.findIndex(t => t.id === taskId)
    if (idx === -1) return false
    // Merge updates, also write back assignedAgent for compat
    const merged = { ...tasks[idx], ...updates, updatedAt: new Date().toISOString() }
    if (updates.assignees && updates.assignees.length > 0) {
      merged.assignedAgent = updates.assignees[0]
    }
    // Map 'in_progress' back to 'running' for project tasks (compat)
    if ((merged as Record<string, unknown>).status === 'in_progress') {
      (merged as Record<string, unknown>).status = 'running'
    }
    tasks[idx] = merged
    meta.tasks = tasks
    writeFileSync(metaPath, JSON.stringify(meta, null, 2) + '\n')
    return true
  } catch {
    return false
  }
}

/** Delete a task from a project's .project-meta.json */
function deleteProjectTask(projectId: string, taskId: string): boolean {
  const metaPath = join(PROJECTS_DIR, projectId, '.project-meta.json')
  if (!existsSync(metaPath)) return false
  try {
    const meta = JSON.parse(readFileSync(metaPath, 'utf-8'))
    const tasks = (meta.tasks || []) as Record<string, unknown>[]
    const idx = tasks.findIndex(t => t.id === taskId)
    if (idx === -1) return false
    tasks.splice(idx, 1)
    meta.tasks = tasks
    writeFileSync(metaPath, JSON.stringify(meta, null, 2) + '\n')
    return true
  } catch {
    return false
  }
}

// ── GET /api/tasks ──────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const projectId = url.searchParams.get('projectId')
  const status = url.searchParams.get('status')
  const assignee = url.searchParams.get('assignee')

  let tasks = [...readProjectTasks(), ...readStandaloneTasks()]

  // Filters
  if (projectId) {
    tasks = tasks.filter(t => projectId === 'standalone' ? !t.projectId : t.projectId === projectId)
  }
  if (status) {
    tasks = tasks.filter(t => t.status === status)
  }
  if (assignee) {
    tasks = tasks.filter(t => t.assignees.includes(assignee))
  }

  // Sort: by priority (P0 first), then updatedAt desc
  const priorityOrder: Record<string, number> = { P0: 0, P1: 1, P2: 2 }
  tasks.sort((a, b) => {
    const pd = (priorityOrder[a.priority] ?? 1) - (priorityOrder[b.priority] ?? 1)
    if (pd !== 0) return pd
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  })

  return NextResponse.json({ tasks, source: 'filesystem' })
}

// ── POST /api/tasks ─────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const now = new Date().toISOString()
    const id = body.id || `task-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`

    const task: Task = {
      id,
      name: body.name || 'Untitled Task',
      description: body.description || undefined,
      projectId: body.projectId || null,
      phase: body.phase || undefined,
      status: body.status || 'pending',
      priority: body.priority || 'P1',
      assignees: body.assignees || [],
      assignedAgent: (body.assignees || [])[0] || undefined,
      creator: body.creator || 'user',
      progress: body.progress || 0,
      dependencies: body.dependencies || [],
      output: body.output || undefined,
      tags: body.tags || undefined,
      createdAt: now,
      updatedAt: now,
    }

    if (task.projectId) {
      // Add to project meta
      const metaPath = join(PROJECTS_DIR, task.projectId, '.project-meta.json')
      if (!existsSync(metaPath)) {
        return NextResponse.json({ error: `Project ${task.projectId} not found` }, { status: 404 })
      }
      const meta = JSON.parse(readFileSync(metaPath, 'utf-8'))
      if (!meta.tasks) meta.tasks = []
      // Store with compat fields
      const stored = { ...task }
      if (stored.status === 'in_progress') (stored as Record<string, unknown>).status = 'running'
      meta.tasks.push(stored)
      writeFileSync(metaPath, JSON.stringify(meta, null, 2) + '\n')
    } else {
      // Add to standalone tasks
      const tasks = readStandaloneTasks()
      tasks.push(task)
      writeStandaloneTasks(tasks)
    }

    return NextResponse.json({ task, ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 })
  }
}

// ── PUT /api/tasks ──────────────────────────────────────────────

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json()
    const { id, ...updates } = body
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

    updates.updatedAt = new Date().toISOString()

    // Handle completion timestamp
    if (updates.status === 'completed' && !updates.completedAt) {
      updates.completedAt = updates.updatedAt
    }

    // Try standalone tasks first
    const standalone = readStandaloneTasks()
    const sIdx = standalone.findIndex(t => t.id === id)
    if (sIdx !== -1) {
      const merged = { ...standalone[sIdx], ...updates }
      if (updates.assignees) merged.assignedAgent = updates.assignees[0] || undefined
      standalone[sIdx] = merged
      writeStandaloneTasks(standalone)
      return NextResponse.json({ task: merged, ok: true })
    }

    // Try project tasks
    const projectTasks = readProjectTasks()
    const pt = projectTasks.find(t => t.id === id)
    if (pt && pt.projectId) {
      const success = updateProjectTask(pt.projectId, id, updates)
      if (success) {
        return NextResponse.json({ task: { ...pt, ...updates }, ok: true })
      }
    }

    return NextResponse.json({ error: 'Task not found' }, { status: 404 })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 })
  }
}

// ── DELETE /api/tasks ───────────────────────────────────────────

export async function DELETE(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const id = url.searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

    // Try standalone tasks first
    const standalone = readStandaloneTasks()
    const sIdx = standalone.findIndex(t => t.id === id)
    if (sIdx !== -1) {
      standalone.splice(sIdx, 1)
      writeStandaloneTasks(standalone)
      return NextResponse.json({ ok: true })
    }

    // Try project tasks
    const projectTasks = readProjectTasks()
    const pt = projectTasks.find(t => t.id === id)
    if (pt && pt.projectId) {
      const success = deleteProjectTask(pt.projectId, id)
      if (success) return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'Task not found' }, { status: 404 })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 })
  }
}
