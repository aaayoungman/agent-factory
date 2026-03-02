import { NextRequest, NextResponse } from 'next/server'
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, symlinkSync, unlinkSync, lstatSync } from 'fs'
import { join, resolve } from 'path'
import { execSync } from 'child_process'

export const dynamic = 'force-dynamic'

const PROJECT_ROOT = resolve(process.cwd(), '..')
const AGENTS_DIR = join(PROJECT_ROOT, 'agents')
const PROJECT_SKILLS_DIR = join(PROJECT_ROOT, 'skills')

interface AgentConfig {
  model?: string
  skills?: string[]  // enabled skill slugs
  [key: string]: unknown
}

function readAgentConfig(agentId: string): AgentConfig {
  const configPath = join(AGENTS_DIR, agentId, 'agent.json')
  if (!existsSync(configPath)) return {}
  try {
    return JSON.parse(readFileSync(configPath, 'utf-8'))
  } catch {
    return {}
  }
}

function writeAgentConfig(agentId: string, config: AgentConfig) {
  const configPath = join(AGENTS_DIR, agentId, 'agent.json')
  writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n')
}

/** Find OpenClaw built-in skills directory */
function findBuiltinSkillsDir(): string | null {
  // Try to find openclaw via npm root
  try {
    const openclawRoot = execSync(
      'npm root -g',
      { encoding: 'utf-8', timeout: 5000 }
    ).trim()
    const dir = join(openclawRoot, 'openclaw', 'skills')
    if (existsSync(dir)) return dir
  } catch {}
  // Fallback to common global paths
  const candidates = [
    '/opt/homebrew/lib/node_modules/openclaw/skills',
    '/usr/local/lib/node_modules/openclaw/skills',
    join(PROJECT_ROOT, 'node_modules/openclaw/skills'),
  ]
  for (const c of candidates) {
    if (existsSync(c)) return c
  }
  return null
}

interface SkillInfo {
  slug: string
  enabled: boolean
  hasSkillMd: boolean
  source: 'builtin' | 'project'
  description: string
}

/** List all available skills from both builtin and project directories */
function listAllSkills(): SkillInfo[] {
  const skills: SkillInfo[] = []
  const seen = new Set<string>()

  // Project skills first (higher priority)
  if (existsSync(PROJECT_SKILLS_DIR)) {
    for (const d of readdirSync(PROJECT_SKILLS_DIR, { withFileTypes: true })) {
      if (!d.isDirectory() || d.name.startsWith('.')) continue
      seen.add(d.name)
      skills.push({
        slug: d.name,
        enabled: false,
        hasSkillMd: existsSync(join(PROJECT_SKILLS_DIR, d.name, 'SKILL.md')),
        source: 'project',
        description: extractDescription(join(PROJECT_SKILLS_DIR, d.name)),
      })
    }
  }

  // Builtin skills
  const builtinDir = findBuiltinSkillsDir()
  if (builtinDir) {
    for (const d of readdirSync(builtinDir, { withFileTypes: true })) {
      if (!d.isDirectory() || d.name.startsWith('.') || seen.has(d.name)) continue
      seen.add(d.name)
      skills.push({
        slug: d.name,
        enabled: false,
        hasSkillMd: existsSync(join(builtinDir, d.name, 'SKILL.md')),
        source: 'builtin',
        description: extractDescription(join(builtinDir, d.name)),
      })
    }
  }

  skills.sort((a, b) => a.slug.localeCompare(b.slug))
  return skills
}

function extractDescription(dir: string): string {
  const skillMd = join(dir, 'SKILL.md')
  if (existsSync(skillMd)) {
    const content = readFileSync(skillMd, 'utf-8')
    for (const line of content.split('\n')) {
      const t = line.trim()
      if (t && !t.startsWith('#') && !t.startsWith('```') && !t.startsWith('---')) {
        return t.slice(0, 150)
      }
    }
  }
  return ''
}

/** Resolve the actual directory for a skill slug */
function resolveSkillDir(slug: string): string | null {
  const projectPath = join(PROJECT_SKILLS_DIR, slug)
  if (existsSync(projectPath)) return projectPath
  const builtinDir = findBuiltinSkillsDir()
  if (builtinDir) {
    const builtinPath = join(builtinDir, slug)
    if (existsSync(builtinPath)) return builtinPath
  }
  return null
}

/** Sync symlinks in agents/{id}/skills/ to match enabled list */
function syncSkillSymlinks(agentId: string, enabledSlugs: string[]) {
  const agentSkillsDir = join(AGENTS_DIR, agentId, 'skills')
  if (!existsSync(agentSkillsDir)) mkdirSync(agentSkillsDir, { recursive: true })

  // Remove existing symlinks
  for (const entry of readdirSync(agentSkillsDir, { withFileTypes: true })) {
    const fullPath = join(agentSkillsDir, entry.name)
    try {
      if (lstatSync(fullPath).isSymbolicLink()) unlinkSync(fullPath)
    } catch {}
  }

  // Create symlinks for enabled skills
  for (const slug of enabledSlugs) {
    const sourcePath = resolveSkillDir(slug)
    const linkPath = join(agentSkillsDir, slug)
    if (sourcePath && !existsSync(linkPath)) {
      try { symlinkSync(sourcePath, linkPath, 'dir') } catch {}
    }
  }
}

// ── GET: List all skills for an agent ────────────────────────────
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params
  const agentDir = join(AGENTS_DIR, id)
  if (!existsSync(agentDir)) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
  }

  const config = readAgentConfig(id)
  const enabledSlugs = new Set(config.skills || [])
  const skills = listAllSkills().map(s => ({
    ...s,
    enabled: enabledSlugs.has(s.slug),
  }))

  return NextResponse.json({
    skills,
    enabledCount: enabledSlugs.size,
    totalCount: skills.length,
  })
}

// ── PUT: Update enabled skills for an agent ──────────────────────
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params
  const agentDir = join(AGENTS_DIR, id)
  if (!existsSync(agentDir)) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
  }

  const body = await req.json()
  const { skills } = body as { skills: string[] }

  if (!Array.isArray(skills)) {
    return NextResponse.json({ error: 'skills must be an array of slugs' }, { status: 400 })
  }

  // Validate all slugs exist
  const allSlugs = new Set(listAllSkills().map(s => s.slug))
  const validSlugs = skills.filter(s => allSlugs.has(s))

  const config = readAgentConfig(id)
  config.skills = validSlugs
  writeAgentConfig(id, config)
  syncSkillSymlinks(id, validSlugs)

  return NextResponse.json({ skills: validSlugs, synced: true })
}
