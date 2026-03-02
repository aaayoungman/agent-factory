/**
 * ClawHub CLI wrapper — search, explore, install, inspect, list, update skills.
 *
 * Uses the `clawhub` CLI binary. All operations are run against the project's
 * skills directory (agent-factory/skills/).
 */
import { execSync } from 'child_process'
import { resolve } from 'path'

const PROJECT_ROOT = resolve(process.cwd(), '..')
const SKILLS_DIR = resolve(PROJECT_ROOT, 'skills')
const CLAWHUB_BIN = resolve(PROJECT_ROOT, 'node_modules', '.bin', 'clawhub')

function run(args: string, timeoutMs = 30000): string {
  return execSync(`"${CLAWHUB_BIN}" ${args} --workdir "${PROJECT_ROOT}" --dir skills --no-input`, {
    timeout: timeoutMs,
    encoding: 'utf-8',
    env: { ...process.env, NO_COLOR: '1' },
  }).trim()
}

// ── Search ───────────────────────────────────────────────────────
export interface SearchResult {
  slug: string
  version: string
  name: string
  score: number
}

export function search(query: string, limit = 20): SearchResult[] {
  const raw = run(`search "${query}" --limit ${limit}`)
  return parseSearchResults(raw)
}

// ── Explore (latest updated) ─────────────────────────────────────
export interface ExploreResult {
  slug: string
  version: string
  name: string
  updatedAt: string
  summary?: string
  downloads?: number
  stars?: number
}

export function explore(limit = 20): ExploreResult[] {
  const raw = run(`explore --limit ${limit}`)
  // Format: "slug  vX.Y.Z  time-ago  Description..."
  const lines = raw.split('\n').filter(l => l.trim() && !l.startsWith('-'))
  return lines.map(line => {
    const match = line.match(/^(\S+)\s+v([\d.]+)\s+(.+?)\s{2,}(.*)$/)
    if (!match) return null
    return {
      slug: match[1],
      version: match[2],
      updatedAt: match[3].trim(),
      name: match[4].trim(),
    }
  }).filter(Boolean) as ExploreResult[]
}

export function exploreJson(limit = 20): ExploreResult[] {
  try {
    const raw = run(`explore --limit ${limit} --json`, 60000)
    const data = JSON.parse(raw)
    const items = Array.isArray(data) ? data : (data.items || data.skills || data.results || [])
    return items.map((item: Record<string, unknown>) => {
      const stats = item.stats as Record<string, number> | undefined
      const latestVer = item.latestVersion as Record<string, unknown> | undefined
      return {
        slug: (item.slug || item.name || '') as string,
        version: (latestVer?.version || item.version || '') as string,
        name: (item.displayName || item.name || item.slug || '') as string,
        updatedAt: typeof item.updatedAt === 'number'
          ? new Date(item.updatedAt).toLocaleDateString()
          : (item.updatedAt || '') as string,
        summary: (item.summary || item.description || '') as string,
        downloads: stats?.downloads,
        stars: stats?.stars,
      }
    })
  } catch {
    // Fallback to text-based explore if --json is not supported
    return explore(limit)
  }
}

// ── Inspect (skill details) ──────────────────────────────────────
export interface SkillDetail {
  slug: string
  name: string
  summary: string
  owner: string
  version: string
  createdAt: string
  updatedAt: string
  tags: string
}

export function inspect(slug: string): SkillDetail | null {
  try {
    const raw = run(`inspect ${slug}`)
    const lines = raw.split('\n')

    // First line: "slug  Name"
    const header = lines[0]?.match(/^(\S+)\s+(.+)$/)
    const detail: SkillDetail = {
      slug: header?.[1] || slug,
      name: header?.[2] || slug,
      summary: '',
      owner: '',
      version: '',
      createdAt: '',
      updatedAt: '',
      tags: '',
    }

    for (const line of lines) {
      if (line.startsWith('Summary:')) detail.summary = line.slice(8).trim()
      if (line.startsWith('Owner:')) detail.owner = line.slice(6).trim()
      if (line.startsWith('Latest:')) detail.version = line.slice(7).trim()
      if (line.startsWith('Created:')) detail.createdAt = line.slice(8).trim()
      if (line.startsWith('Updated:')) detail.updatedAt = line.slice(8).trim()
      if (line.startsWith('Tags:')) detail.tags = line.slice(5).trim()
    }

    return detail
  } catch {
    return null
  }
}

// ── List installed ───────────────────────────────────────────────
export interface InstalledSkill {
  slug: string
  version: string
  status: string
}

export function listInstalled(): InstalledSkill[] {
  try {
    const raw = run('list')
    if (raw.includes('No installed skills')) return []
    // Parse list output
    const lines = raw.split('\n').filter(l => l.trim() && !l.startsWith('-'))
    return lines.map(line => {
      const match = line.match(/^(\S+)\s+v?([\d.]+)\s*(.*)$/)
      if (!match) return null
      return { slug: match[1], version: match[2], status: match[3]?.trim() || 'installed' }
    }).filter(Boolean) as InstalledSkill[]
  } catch {
    return []
  }
}

// ── Install ──────────────────────────────────────────────────────
export function install(slug: string, version?: string): { ok: boolean; output: string } {
  try {
    const versionFlag = version ? ` --version ${version}` : ''
    const output = run(`install ${slug}${versionFlag} --force`, 60000)
    return { ok: true, output }
  } catch (e: any) {
    return { ok: false, output: e.message || 'Install failed' }
  }
}

// ── Update ───────────────────────────────────────────────────────
export function update(slug?: string): { ok: boolean; output: string } {
  try {
    const target = slug ? slug : '--all'
    const output = run(`update ${target} --force`, 60000)
    return { ok: true, output }
  } catch (e: any) {
    return { ok: false, output: e.message || 'Update failed' }
  }
}

// ── Uninstall (rm -rf skills/slug) ───────────────────────────────
export function uninstall(slug: string): { ok: boolean } {
  try {
    const { rmSync, existsSync } = require('fs')
    const skillDir = resolve(SKILLS_DIR, slug)
    if (!skillDir.startsWith(SKILLS_DIR)) return { ok: false } // path traversal guard
    if (existsSync(skillDir)) {
      rmSync(skillDir, { recursive: true, force: true })
    }
    return { ok: true }
  } catch {
    return { ok: false }
  }
}

// ── Parse helpers ────────────────────────────────────────────────
function parseSearchResults(raw: string): SearchResult[] {
  // Format may be "slug  Name  (score)" or "slug vX.Y.Z  Name  (score)"
  const lines = raw.split('\n').filter(l => l.trim() && !l.startsWith('-'))
  return lines.map(line => {
    const match = line.match(/^(\S+)\s+(?:v([\d.]+)\s+)?(.+?)\s+\(([\d.]+)\)$/)
    if (!match) return null
    return {
      slug: match[1],
      version: match[2] || '',
      name: match[3].trim(),
      score: parseFloat(match[4]),
    }
  }).filter(Boolean) as SearchResult[]
}
