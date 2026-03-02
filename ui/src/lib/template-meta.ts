/**
 * Template Metadata — reads template.json from templates/builtin/ and templates/custom/
 */
import { readdirSync, readFileSync, existsSync } from 'fs'
import { join, resolve } from 'path'

const PROJECT_ROOT = resolve(process.cwd(), '..')
const TEMPLATES_DIR = join(PROJECT_ROOT, 'templates')

export interface TemplateMeta {
  id: string
  name: string
  description: string
  emoji: string
  category: 'builtin' | 'custom'
  group?: string
  hidden?: boolean
  hasIdentityFiles: boolean
  defaults: {
    model: string
    skills: string[]
    peers: string[]
  }
}

export function readTemplates(): TemplateMeta[] {
  const templates: TemplateMeta[] = []

  for (const category of ['builtin', 'custom'] as const) {
    const dir = join(TEMPLATES_DIR, category)
    if (!existsSync(dir)) continue

    const dirs = readdirSync(dir, { withFileTypes: true })
      .filter(d => d.isDirectory())

    for (const d of dirs) {
      const templatePath = join(dir, d.name, 'template.json')
      if (!existsSync(templatePath)) continue

      try {
        const data = JSON.parse(readFileSync(templatePath, 'utf-8'))
        const tmplDirPath = join(dir, d.name)
        const hasIdentity = existsSync(join(tmplDirPath, 'IDENTITY.md'))
        const hasSoul = existsSync(join(tmplDirPath, 'SOUL.md'))
        templates.push({
          id: data.id || d.name,
          name: data.name || d.name,
          description: data.description || '',
          emoji: data.emoji || '🤖',
          category,
          group: data.group || undefined,
          hidden: data.hidden || false,
          hasIdentityFiles: hasIdentity && hasSoul,
          defaults: {
            model: data.defaults?.model || '',
            skills: data.defaults?.skills || [],
            peers: data.defaults?.peers || [],
          },
        })
      } catch {
        // Skip malformed template.json
      }
    }
  }

  return templates
}

export function readTemplate(id: string): TemplateMeta | null {
  for (const category of ['builtin', 'custom'] as const) {
    const templatePath = join(TEMPLATES_DIR, category, id, 'template.json')
    if (!existsSync(templatePath)) continue

    try {
      const data = JSON.parse(readFileSync(templatePath, 'utf-8'))
      const tmplDirPath = join(TEMPLATES_DIR, category, id)
      const hasIdentity = existsSync(join(tmplDirPath, 'IDENTITY.md'))
      const hasSoul = existsSync(join(tmplDirPath, 'SOUL.md'))
      return {
        id: data.id || id,
        name: data.name || id,
        description: data.description || '',
        emoji: data.emoji || '🤖',
        category,
        group: data.group || undefined,
        hidden: data.hidden || false,
        hasIdentityFiles: hasIdentity && hasSoul,
        defaults: {
          model: data.defaults?.model || '',
          skills: data.defaults?.skills || [],
          peers: data.defaults?.peers || [],
        },
      }
    } catch {
      return null
    }
  }
  return null
}

export function getTemplateDir(id: string): string | null {
  for (const category of ['builtin', 'custom']) {
    const dir = join(TEMPLATES_DIR, category, id)
    if (existsSync(dir)) return dir
  }
  return null
}
