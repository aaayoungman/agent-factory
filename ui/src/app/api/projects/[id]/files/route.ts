import { NextRequest, NextResponse } from 'next/server'
import { readdirSync, readFileSync, existsSync, statSync } from 'fs'
import { join, resolve } from 'path'

export const dynamic = 'force-dynamic'

const PROJECT_ROOT = resolve(process.cwd(), '..')
const PROJECTS_DIR = join(PROJECT_ROOT, 'projects')

interface FileEntry {
  name: string
  type: 'file' | 'directory'
  size?: number
  path: string
  source: 'project' | 'code'
}

/**
 * GET /api/projects/[id]/files
 *
 * Without ?file= → list files from project dir + codeLocation
 * With ?file=path&source=project|code → return file content
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params
  if (!id || id.includes('..') || id.includes('/')) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 })
  }

  const projectDir = join(PROJECTS_DIR, id)
  if (!existsSync(projectDir)) {
    return NextResponse.json({ error: 'Project not found', files: [] }, { status: 404 })
  }

  // Read meta for codeLocation (resolve from project root, fallback to project dir)
  let codeDir: string | null = null
  try {
    const metaPath = join(projectDir, '.project-meta.json')
    if (existsSync(metaPath)) {
      const meta = JSON.parse(readFileSync(metaPath, 'utf-8'))
      if (meta.codeLocation) {
        const fromRoot = resolve(PROJECT_ROOT, meta.codeLocation)
        const fromProject = resolve(projectDir, meta.codeLocation)
        if (existsSync(fromRoot)) codeDir = fromRoot
        else if (existsSync(fromProject)) codeDir = fromProject
      }
    }
  } catch { /* ignore */ }

  const fileParam = req.nextUrl.searchParams.get('file')
  const sourceParam = req.nextUrl.searchParams.get('source') || 'code'

  // ── Return file content ────────────────────────────────────────
  if (fileParam) {
    const baseDir = sourceParam === 'project' ? projectDir : (codeDir || projectDir)
    const filePath = resolve(baseDir, fileParam)

    // Security: prevent path traversal
    if (!filePath.startsWith(baseDir)) {
      return NextResponse.json({ error: 'Invalid path' }, { status: 400 })
    }
    if (!existsSync(filePath)) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 })
    }
    try {
      const stat = statSync(filePath)
      if (stat.isDirectory()) {
        return NextResponse.json({ error: 'Is a directory' }, { status: 400 })
      }
      if (stat.size > 1_000_000) {
        return NextResponse.json({ content: '(File too large to preview, > 1MB)', size: stat.size })
      }
      const content = readFileSync(filePath, 'utf-8')
      return NextResponse.json({ content, size: stat.size })
    } catch {
      return NextResponse.json({ content: '(Binary file, cannot preview)' })
    }
  }

  // ── List files ─────────────────────────────────────────────────
  try {
    const files: FileEntry[] = []

    // 1. Project docs (from projects/{id}/)
    const docsDir = join(projectDir, 'docs')
    if (existsSync(docsDir)) {
      const docFiles = listDir(docsDir, projectDir, 0, 'project')
      if (docFiles.length > 0) {
        files.push({ name: 'docs', type: 'directory', path: 'docs', source: 'project' })
        files.push(...docFiles)
      }
    }

    // 2. Code files (from codeLocation)
    if (codeDir) {
      const codeFiles = listDir(codeDir, codeDir, 0, 'code')
      files.push(...codeFiles)
    }

    return NextResponse.json({ files, codeLocation: codeDir ? true : false })
  } catch (e) {
    return NextResponse.json({ error: String(e), files: [] }, { status: 500 })
  }
}

const SKIP_DIRS = new Set(['node_modules', '.next', '.git', '__pycache__', '.turbo', '.vercel'])

/** Recursively list files (max depth 4) */
function listDir(dir: string, root: string, depth: number, source: 'project' | 'code'): FileEntry[] {
  if (depth > 4) return []
  const entries = readdirSync(dir, { withFileTypes: true })
  const result: FileEntry[] = []

  // Sort: directories first, then files
  const sorted = [...entries].sort((a, b) => {
    if (a.isDirectory() && !b.isDirectory()) return -1
    if (!a.isDirectory() && b.isDirectory()) return 1
    return a.name.localeCompare(b.name)
  })

  for (const entry of sorted) {
    if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue

    const fullPath = join(dir, entry.name)
    const relativePath = fullPath.slice(root.length + 1)

    if (entry.isDirectory()) {
      const children = listDir(fullPath, root, depth + 1, source)
      result.push({ name: entry.name, type: 'directory', path: relativePath, source })
      result.push(...children)
    } else {
      try {
        const stat = statSync(fullPath)
        result.push({ name: entry.name, type: 'file', size: stat.size, path: relativePath, source })
      } catch {
        result.push({ name: entry.name, type: 'file', path: relativePath, source })
      }
    }
  }

  return result
}
