/**
 * Department Metadata — reads/writes config/departments.json
 */
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join, resolve } from 'path'
import type { Department } from './types'

const PROJECT_ROOT = resolve(process.cwd(), '..')
const DEPARTMENTS_FILE = join(PROJECT_ROOT, 'config/departments.json')

export function getDefaultDepartments(): Department[] {
  return [
    {
      id: 'dev',
      name: '软件开发部',
      nameEn: 'Software Development',
      emoji: '💻',
      order: 0,
      floorColor: { h: 35, s: 30, b: 15, c: 0 },
      furniture: [
        { type: 'desk', count: 4 },
        { type: 'bookshelf', count: 1 },
        { type: 'plant', count: 2 },
        { type: 'whiteboard', count: 1 },
        { type: 'cooler', count: 1 },
      ],
    },
    {
      id: 'novel',
      name: '网文创作部',
      nameEn: 'Novel Writing',
      emoji: '📚',
      order: 1,
      floorColor: { h: 25, s: 45, b: 5, c: 10 },
      furniture: [
        { type: 'desk', count: 4 },
        { type: 'bookshelf', count: 2 },
        { type: 'plant', count: 1 },
        { type: 'lamp', count: 2 },
        { type: 'meeting_table', count: 1 },
      ],
    },
  ]
}

export function readDepartments(): Department[] {
  if (!existsSync(DEPARTMENTS_FILE)) {
    return getDefaultDepartments()
  }
  try {
    const data = JSON.parse(readFileSync(DEPARTMENTS_FILE, 'utf-8'))
    return data.departments || getDefaultDepartments()
  } catch {
    return getDefaultDepartments()
  }
}

export function writeDepartments(departments: Department[]): void {
  writeFileSync(DEPARTMENTS_FILE, JSON.stringify({ departments }, null, 2) + '\n')
}
