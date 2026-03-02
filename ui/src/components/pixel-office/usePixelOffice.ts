'use client'
import { useEffect, useRef, useCallback, useState, useMemo } from 'react'
import { useAppStore } from '@/lib/store'
import type { Agent, Department } from '@/lib/types'
import { OfficeState } from './engine/officeState'
import { generateLayout, getLayoutSize, generateDepartmentLayout } from './layout/layoutGenerator'
import type { DepartmentRoomInput } from './layout/layoutGenerator'
import type { CollaborationLink } from './engine/renderer'
import { SLEEP_THRESHOLD_SEC } from './pixel-constants'

function stableHash(str: string): number {
  let hash = 5381
  for (let i = 0; i < str.length; i++) hash = ((hash << 5) + hash + str.charCodeAt(i)) >>> 0
  return hash % 100000 + 1
}

export interface PixelOfficeState {
  officeState: OfficeState
  agentMap: Map<number, Agent>
  getAgentByNumericId: (numericId: number) => Agent | undefined
  collaborationLinks: CollaborationLink[]
}

export function usePixelOffice(): PixelOfficeState | null {
  const agents = useAppStore((s) => s.agents)
  const agentActivePairs = useAppStore((s) => s.agentActivePairs)
  const agentErrors = useAppStore((s) => s.agentErrors)
  const lastActivityTimestamps = useAppStore((s) => s.lastActivityTimestamps)
  const departments = useAppStore((s) => s.departments)
  const templates = useAppStore((s) => s.templates)
  const officeRef = useRef<OfficeState | null>(null)
  const agentMapRef = useRef<Map<number, Agent>>(new Map())
  const prevIdsRef = useRef<Set<string>>(new Set())
  const layoutSizeRef = useRef<string>('small')
  const deptKeyRef = useRef<string>('')
  const activeMeetingRef = useRef<Set<string>>(new Set())
  const [, forceUpdate] = useState(0)

  // Build agent → department mapping
  const templateGroupMap = useMemo(() => {
    const map: Record<string, string> = {}
    for (const tmpl of templates) {
      if (tmpl.group) map[tmpl.id] = tmpl.group
    }
    return map
  }, [templates])

  const getAgentDepartment = useCallback((agent: Agent): string => {
    return agent.department || (agent.templateId && templateGroupMap[agent.templateId]) || 'other'
  }, [templateGroupMap])

  // Compute department layout key (changes when departments or their configs change)
  const deptLayoutKey = useMemo(() => {
    if (departments.length === 0) return ''
    return departments.map(d => `${d.id}:${d.order}:${d.furniture.map(f => `${f.type}${f.count}`).join(',')}`).join('|')
  }, [departments])

  // Generate layout based on departments
  const generateCurrentLayout = useCallback(() => {
    if (departments.length > 0) {
      // Build room inputs from departments
      const rooms: DepartmentRoomInput[] = departments
        .sort((a, b) => a.order - b.order)
        .map(dept => ({
          department: dept,
          agentCount: agents.filter(a => getAgentDepartment(a) === dept.id).length,
        }))

      // Also add an "other" room if there are unassigned agents
      const otherAgents = agents.filter(a => {
        const d = getAgentDepartment(a)
        return d === 'other' || !departments.find(dep => dep.id === d)
      })
      if (otherAgents.length > 0) {
        const otherDept: Department = {
          id: 'other',
          name: '其他',
          nameEn: 'Other',
          emoji: '🤖',
          order: 999,
          floorColor: { h: 200, s: 20, b: 10, c: 0 },
          furniture: [
            { type: 'desk', count: Math.max(1, Math.ceil(otherAgents.length / 4)) },
            { type: 'plant', count: 1 },
            { type: 'cooler', count: 1 },
          ],
        }
        rooms.push({ department: otherDept, agentCount: otherAgents.length })
      }

      return generateDepartmentLayout(rooms)
    }
    // Fallback: use old size-based layout
    const size = getLayoutSize(agents.length)
    return generateLayout(size)
  }, [departments, agents, getAgentDepartment])

  // Initialize office state
  if (!officeRef.current) {
    const size = getLayoutSize(agents.length)
    layoutSizeRef.current = size
    deptKeyRef.current = deptLayoutKey
    const layout = departments.length > 0 ? generateCurrentLayout() : generateLayout(size)
    officeRef.current = new OfficeState(layout)
  }

  // Rebuild layout when departments change
  useEffect(() => {
    const office = officeRef.current
    if (!office) return
    if (deptLayoutKey === deptKeyRef.current) return
    deptKeyRef.current = deptLayoutKey

    if (departments.length > 0) {
      const newLayout = generateCurrentLayout()
      office.rebuildFromLayout(newLayout)
      // Re-add all agents with room preference
      agentMapRef.current.clear()
      for (const agent of agents) {
        const numId = stableHash(agent.id)
        agentMapRef.current.set(numId, agent)
        const roomId = getAgentDepartment(agent)
        office.addAgent(numId, undefined, undefined, undefined, true, roomId)
        office.setAgentActive(numId, agent.status === 'busy')
      }
      prevIdsRef.current = new Set(agents.map(a => a.id))
      forceUpdate((n) => n + 1)
    }
  }, [deptLayoutKey, departments, agents, generateCurrentLayout, getAgentDepartment])

  // Sync agents to office
  useEffect(() => {
    const office = officeRef.current
    if (!office) return

    const currentIds = new Set(agents.map((a) => a.id))
    const prevIds = prevIdsRef.current

    // Check if layout needs resizing (only when no departments)
    if (departments.length === 0) {
      const newSize = getLayoutSize(agents.length)
      if (newSize !== layoutSizeRef.current) {
        layoutSizeRef.current = newSize
        const newLayout = generateLayout(newSize)
        office.rebuildFromLayout(newLayout)
        agentMapRef.current.clear()
        for (const agent of agents) {
          const numId = stableHash(agent.id)
          agentMapRef.current.set(numId, agent)
          office.addAgent(numId)
          office.setAgentActive(numId, agent.status === 'busy')
        }
        prevIdsRef.current = currentIds
        forceUpdate((n) => n + 1)
        return
      }
    }

    // Add new agents
    for (const agent of agents) {
      if (!prevIds.has(agent.id)) {
        const numId = stableHash(agent.id)
        agentMapRef.current.set(numId, agent)
        const roomId = departments.length > 0 ? getAgentDepartment(agent) : undefined
        office.addAgent(numId, undefined, undefined, undefined, undefined, roomId)
        office.setAgentActive(numId, agent.status === 'busy')
      }
    }

    // Remove departed agents
    for (const prevId of Array.from(prevIds)) {
      if (!currentIds.has(prevId)) {
        const numId = stableHash(prevId)
        office.removeAgent(numId)
        agentMapRef.current.delete(numId)
      }
    }

    // Update status for existing agents
    for (const agent of agents) {
      const numId = stableHash(agent.id)
      agentMapRef.current.set(numId, agent)
      const isBusy = agent.status === 'busy'
      office.setAgentActive(numId, isBusy)
    }

    prevIdsRef.current = currentIds
  }, [agents, departments, getAgentDepartment])

  // Tool sync — update currentTool for busy agents
  useEffect(() => {
    const office = officeRef.current
    if (!office) return
    for (const agent of agents) {
      if (agent.status === 'busy' && agent.currentTool) {
        const numId = stableHash(agent.id)
        office.setAgentTool(numId, agent.currentTool)
      }
    }
  }, [agents])

  // Meeting detection — when 2+ agents are actively communicating
  useEffect(() => {
    const office = officeRef.current
    if (!office || agentActivePairs.length === 0) return

    // Build groups of communicating agents
    const agentGroups = new Map<string, Set<string>>()
    for (const pair of agentActivePairs) {
      if (pair.from === 'system' || pair.from === 'user') continue
      let group: Set<string> | undefined
      for (const entry of Array.from(agentGroups.values())) {
        if (entry.has(pair.from) || entry.has(pair.to)) {
          group = entry
          break
        }
      }
      if (!group) {
        group = new Set<string>()
        agentGroups.set(`group-${agentGroups.size}`, group)
      }
      group.add(pair.from)
      group.add(pair.to)
    }

    // Start meetings for groups with 2+ agents
    for (const group of Array.from(agentGroups.values())) {
      if (group.size < 2) continue
      const groupKey = Array.from(group).sort().join(',')
      if (activeMeetingRef.current.has(groupKey)) continue

      const numIds: number[] = []
      for (const agentId of Array.from(group)) {
        numIds.push(stableHash(agentId))
      }
      office.startMeeting(numIds)
      activeMeetingRef.current.add(groupKey)
    }

    // Clean up stale meeting groups
    const currentGroupKeys = new Set<string>()
    for (const group of Array.from(agentGroups.values())) {
      if (group.size >= 2) {
        currentGroupKeys.add(Array.from(group).sort().join(','))
      }
    }
    for (const key of Array.from(activeMeetingRef.current)) {
      if (!currentGroupKeys.has(key)) {
        activeMeetingRef.current.delete(key)
      }
    }
  }, [agentActivePairs])

  // Error sync
  useEffect(() => {
    const office = officeRef.current
    if (!office) return
    const now = Date.now()
    for (const [agentId, errorTs] of Object.entries(agentErrors)) {
      if (now - errorTs < 30_000) {
        const numId = stableHash(agentId)
        office.setAgentError(numId)
      }
    }
  }, [agentErrors])

  // Sleep detection — agents idle for >30 minutes
  useEffect(() => {
    const office = officeRef.current
    if (!office) return
    const now = Date.now()
    const thresholdMs = SLEEP_THRESHOLD_SEC * 1000
    for (const agent of agents) {
      if (agent.status === 'busy') continue
      const lastTs = lastActivityTimestamps[agent.id]
      if (lastTs && (now - lastTs) > thresholdMs) {
        const numId = stableHash(agent.id)
        office.setAgentSleep(numId)
      }
    }
  }, [agents, lastActivityTimestamps])

  // Build collaboration links from active pairs
  const collaborationLinks = useMemo<CollaborationLink[]>(() => {
    const links: CollaborationLink[] = []
    for (const pair of agentActivePairs) {
      if (pair.from === 'system' || pair.from === 'user') continue
      links.push({
        fromAgentId: stableHash(pair.from),
        toAgentId: stableHash(pair.to),
        type: pair.type,
      })
    }
    return links
  }, [agentActivePairs])

  const getAgentByNumericId = useCallback((numericId: number): Agent | undefined => {
    return agentMapRef.current.get(numericId)
  }, [])

  if (!officeRef.current) return null

  return {
    officeState: officeRef.current,
    agentMap: agentMapRef.current,
    getAgentByNumericId,
    collaborationLinks,
  }
}
