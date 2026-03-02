import { TILE_SIZE, MATRIX_EFFECT_DURATION, CharacterState, Direction, FurnitureType } from '../pixel-types'
import {
  PALETTE_COUNT,
  HUE_SHIFT_MIN_DEG,
  HUE_SHIFT_RANGE_DEG,
  WAITING_BUBBLE_DURATION_SEC,
  DISMISS_BUBBLE_FAST_FADE_SEC,
  INACTIVE_SEAT_TIMER_MIN_SEC,
  INACTIVE_SEAT_TIMER_RANGE_SEC,
  AUTO_ON_FACING_DEPTH,
  AUTO_ON_SIDE_DEPTH,
  CHARACTER_SITTING_OFFSET_PX,
  CHARACTER_HIT_HALF_WIDTH,
  CHARACTER_HIT_HEIGHT,
  DRINK_DURATION_SEC,
  DRINK_CHANCE_PER_WANDER,
  ERROR_BUBBLE_DURATION_SEC,
  MEETING_DURATION_MIN_SEC,
  MEETING_DURATION_MAX_SEC,
  SLEEP_OPACITY,
} from '../pixel-constants'
import type { Character, Seat, FurnitureInstance, TileType as TileTypeVal, OfficeLayout, PlacedFurniture } from '../pixel-types'
import { createCharacter, updateCharacter } from './characters'
import { matrixEffectSeeds } from './matrixEffect'
import { isWalkable, getWalkableTiles, findPath } from '../layout/tileMap'
import {
  createDefaultLayout,
  layoutToTileMap,
  layoutToFurnitureInstances,
  layoutToSeats,
  getBlockedTiles,
} from '../layout/layoutSerializer'
import { getCatalogEntry, getOnStateType } from '../layout/furnitureCatalog'

export class OfficeState {
  layout: OfficeLayout
  tileMap: TileTypeVal[][]
  seats: Map<string, Seat>
  blockedTiles: Set<string>
  furniture: FurnitureInstance[]
  walkableTiles: Array<{ col: number; row: number }>
  characters: Map<number, Character> = new Map()
  selectedAgentId: number | null = null
  cameraFollowId: number | null = null
  hoveredAgentId: number | null = null
  hoveredTile: { col: number; row: number } | null = null

  // Meeting state
  private meetingTimers: Map<string, number> = new Map()
  private nextMeetingId = 0

  constructor(layout?: OfficeLayout) {
    this.layout = layout || createDefaultLayout()
    this.tileMap = layoutToTileMap(this.layout)
    this.seats = layoutToSeats(this.layout.furniture)
    this.blockedTiles = getBlockedTiles(this.layout.furniture)
    this.furniture = layoutToFurnitureInstances(this.layout.furniture)
    this.walkableTiles = getWalkableTiles(this.tileMap, this.blockedTiles)
  }

  /** Rebuild all derived state from a new layout. Reassigns existing characters.
   *  @param shift Optional pixel shift to apply when grid expands left/up */
  rebuildFromLayout(layout: OfficeLayout, shift?: { col: number; row: number }): void {
    this.layout = layout
    this.tileMap = layoutToTileMap(layout)
    this.seats = layoutToSeats(layout.furniture)
    this.blockedTiles = getBlockedTiles(layout.furniture)
    this.rebuildFurnitureInstances()
    this.walkableTiles = getWalkableTiles(this.tileMap, this.blockedTiles)

    // Shift character positions when grid expands left/up
    if (shift && (shift.col !== 0 || shift.row !== 0)) {
      for (const ch of Array.from(this.characters.values())) {
        ch.tileCol += shift.col
        ch.tileRow += shift.row
        ch.x += shift.col * TILE_SIZE
        ch.y += shift.row * TILE_SIZE
        // Clear path since tile coords changed
        ch.path = []
        ch.moveProgress = 0
      }
    }

    // Reassign characters to new seats, preserving existing assignments when possible
    for (const seat of Array.from(this.seats.values())) {
      seat.assigned = false
    }

    // First pass: try to keep characters at their existing seats
    for (const ch of Array.from(this.characters.values())) {
      if (ch.seatId && this.seats.has(ch.seatId)) {
        const seat = this.seats.get(ch.seatId)!
        if (!seat.assigned) {
          seat.assigned = true
          // Snap character to seat position
          ch.tileCol = seat.seatCol
          ch.tileRow = seat.seatRow
          const cx = seat.seatCol * TILE_SIZE + TILE_SIZE / 2
          const cy = seat.seatRow * TILE_SIZE + TILE_SIZE / 2
          ch.x = cx
          ch.y = cy
          ch.dir = seat.facingDir
          continue
        }
      }
      ch.seatId = null // will be reassigned below
    }

    // Second pass: assign remaining characters to free seats
    for (const ch of Array.from(this.characters.values())) {
      if (ch.seatId) continue
      const seatId = this.findFreeSeat()
      if (seatId) {
        this.seats.get(seatId)!.assigned = true
        ch.seatId = seatId
        const seat = this.seats.get(seatId)!
        ch.tileCol = seat.seatCol
        ch.tileRow = seat.seatRow
        ch.x = seat.seatCol * TILE_SIZE + TILE_SIZE / 2
        ch.y = seat.seatRow * TILE_SIZE + TILE_SIZE / 2
        ch.dir = seat.facingDir
      }
    }

    // Relocate any characters that ended up outside bounds or on non-walkable tiles
    for (const ch of Array.from(this.characters.values())) {
      if (ch.seatId) continue // seated characters are fine
      if (ch.tileCol < 0 || ch.tileCol >= layout.cols || ch.tileRow < 0 || ch.tileRow >= layout.rows) {
        this.relocateCharacterToWalkable(ch)
      }
    }
  }

  /** Move a character to a random walkable tile */
  private relocateCharacterToWalkable(ch: Character): void {
    if (this.walkableTiles.length === 0) return
    const spawn = this.walkableTiles[Math.floor(Math.random() * this.walkableTiles.length)]
    ch.tileCol = spawn.col
    ch.tileRow = spawn.row
    ch.x = spawn.col * TILE_SIZE + TILE_SIZE / 2
    ch.y = spawn.row * TILE_SIZE + TILE_SIZE / 2
    ch.path = []
    ch.moveProgress = 0
  }

  getLayout(): OfficeLayout {
    return this.layout
  }

  /** Get the blocked-tile key for a character's own seat, or null */
  private ownSeatKey(ch: Character): string | null {
    if (!ch.seatId) return null
    const seat = this.seats.get(ch.seatId)
    if (!seat) return null
    return `${seat.seatCol},${seat.seatRow}`
  }

  /** Temporarily unblock a character's own seat, run fn, then re-block */
  private withOwnSeatUnblocked<T>(ch: Character, fn: () => T): T {
    const key = this.ownSeatKey(ch)
    if (key) this.blockedTiles.delete(key)
    const result = fn()
    if (key) this.blockedTiles.add(key)
    return result
  }

  private findFreeSeat(): string | null {
    for (const [uid, seat] of Array.from(this.seats.entries())) {
      if (!seat.assigned) return uid
    }
    return null
  }

  /** Find a free seat in a specific room */
  findFreeSeatInRoom(roomId: string): string | null {
    for (const [uid, seat] of Array.from(this.seats.entries())) {
      if (!seat.assigned && seat.roomId === roomId) return uid
    }
    return null
  }

  /**
   * Pick a diverse palette for a new agent based on currently active agents.
   * First 6 agents each get a unique skin (random order). Beyond 6, skins
   * repeat in balanced rounds with a random hue shift (>=45 degrees).
   */
  private pickDiversePalette(): { palette: number; hueShift: number } {
    // Count how many non-sub-agents use each base palette (0-5)
    const counts = new Array(PALETTE_COUNT).fill(0) as number[]
    for (const ch of Array.from(this.characters.values())) {
      if (ch.isSubagent) continue
      counts[ch.palette]++
    }
    const minCount = Math.min(...counts)
    // Available = palettes at the minimum count (least used)
    const available: number[] = []
    for (let i = 0; i < PALETTE_COUNT; i++) {
      if (counts[i] === minCount) available.push(i)
    }
    const palette = available[Math.floor(Math.random() * available.length)]
    // First round (minCount === 0): no hue shift. Subsequent rounds: random >=45 degrees.
    let hueShift = 0
    if (minCount > 0) {
      hueShift = HUE_SHIFT_MIN_DEG + Math.floor(Math.random() * HUE_SHIFT_RANGE_DEG)
    }
    return { palette, hueShift }
  }

  addAgent(id: number, preferredPalette?: number, preferredHueShift?: number, preferredSeatId?: string, skipSpawnEffect?: boolean, preferredRoomId?: string): void {
    if (this.characters.has(id)) return

    let palette: number
    let hueShift: number
    if (preferredPalette !== undefined) {
      palette = preferredPalette
      hueShift = preferredHueShift ?? 0
    } else {
      const pick = this.pickDiversePalette()
      palette = pick.palette
      hueShift = pick.hueShift
    }

    // Try preferred seat first, then room, then any free seat
    let seatId: string | null = null
    if (preferredSeatId && this.seats.has(preferredSeatId)) {
      const seat = this.seats.get(preferredSeatId)!
      if (!seat.assigned) {
        seatId = preferredSeatId
      }
    }
    if (!seatId && preferredRoomId) {
      seatId = this.findFreeSeatInRoom(preferredRoomId)
    }
    if (!seatId) {
      seatId = this.findFreeSeat()
    }

    let ch: Character
    if (seatId) {
      const seat = this.seats.get(seatId)!
      seat.assigned = true
      ch = createCharacter(id, palette, seatId, seat, hueShift)
    } else {
      // No seats — spawn at random walkable tile
      const spawn = this.walkableTiles.length > 0
        ? this.walkableTiles[Math.floor(Math.random() * this.walkableTiles.length)]
        : { col: 1, row: 1 }
      ch = createCharacter(id, palette, null, null, hueShift)
      ch.x = spawn.col * TILE_SIZE + TILE_SIZE / 2
      ch.y = spawn.row * TILE_SIZE + TILE_SIZE / 2
      ch.tileCol = spawn.col
      ch.tileRow = spawn.row
    }

    if (!skipSpawnEffect) {
      ch.matrixEffect = 'spawn'
      ch.matrixEffectTimer = 0
      ch.matrixEffectSeeds = matrixEffectSeeds()
    }
    this.characters.set(id, ch)
  }

  removeAgent(id: number): void {
    const ch = this.characters.get(id)
    if (!ch) return
    if (ch.matrixEffect === 'despawn') return // already despawning
    // Free seat and clear selection immediately
    if (ch.seatId) {
      const seat = this.seats.get(ch.seatId)
      if (seat) seat.assigned = false
    }
    if (this.selectedAgentId === id) this.selectedAgentId = null
    if (this.cameraFollowId === id) this.cameraFollowId = null
    // Start despawn animation instead of immediate delete
    ch.matrixEffect = 'despawn'
    ch.matrixEffectTimer = 0
    ch.matrixEffectSeeds = matrixEffectSeeds()
    ch.bubbleType = null
  }

  /** Find seat uid at a given tile position, or null */
  getSeatAtTile(col: number, row: number): string | null {
    for (const [uid, seat] of Array.from(this.seats.entries())) {
      if (seat.seatCol === col && seat.seatRow === row) return uid
    }
    return null
  }

  /** Reassign an agent from their current seat to a new seat */
  reassignSeat(agentId: number, seatId: string): void {
    const ch = this.characters.get(agentId)
    if (!ch) return
    // Unassign old seat
    if (ch.seatId) {
      const old = this.seats.get(ch.seatId)
      if (old) old.assigned = false
    }
    // Assign new seat
    const seat = this.seats.get(seatId)
    if (!seat || seat.assigned) return
    seat.assigned = true
    ch.seatId = seatId
    // Pathfind to new seat (unblock own seat tile for this query)
    const path = this.withOwnSeatUnblocked(ch, () =>
      findPath(ch.tileCol, ch.tileRow, seat.seatCol, seat.seatRow, this.tileMap, this.blockedTiles)
    )
    if (path.length > 0) {
      ch.path = path
      ch.moveProgress = 0
      ch.state = CharacterState.WALK
      ch.frame = 0
      ch.frameTimer = 0
    } else {
      // Already at seat or no path — sit down
      ch.state = CharacterState.TYPE
      ch.dir = seat.facingDir
      ch.frame = 0
      ch.frameTimer = 0
      if (!ch.isActive) {
        ch.seatTimer = INACTIVE_SEAT_TIMER_MIN_SEC + Math.random() * INACTIVE_SEAT_TIMER_RANGE_SEC
      }
    }
  }

  setAgentActive(id: number, active: boolean): void {
    const ch = this.characters.get(id)
    if (ch) {
      ch.isActive = active
      if (!active) {
        // Sentinel -1: signals turn just ended, skip next seat rest timer.
        // Prevents the WALK handler from setting a 2-4 min rest on arrival.
        ch.seatTimer = -1
        ch.path = []
        ch.moveProgress = 0
      }
      this.rebuildFurnitureInstances()
    }
  }

  /** Rebuild furniture instances with auto-state applied (active agents turn electronics ON) */
  private rebuildFurnitureInstances(): void {
    // Collect tiles where active agents face desks
    const autoOnTiles = new Set<string>()
    for (const ch of Array.from(this.characters.values())) {
      if (!ch.isActive || !ch.seatId) continue
      const seat = this.seats.get(ch.seatId)
      if (!seat) continue
      // Find the desk tile(s) the agent faces from their seat
      const dCol = seat.facingDir === Direction.RIGHT ? 1 : seat.facingDir === Direction.LEFT ? -1 : 0
      const dRow = seat.facingDir === Direction.DOWN ? 1 : seat.facingDir === Direction.UP ? -1 : 0
      // Check tiles in the facing direction (desk could be 1-3 tiles deep)
      for (let d = 1; d <= AUTO_ON_FACING_DEPTH; d++) {
        const tileCol = seat.seatCol + dCol * d
        const tileRow = seat.seatRow + dRow * d
        autoOnTiles.add(`${tileCol},${tileRow}`)
      }
      // Also check tiles to the sides of the facing direction (desks can be wide)
      for (let d = 1; d <= AUTO_ON_SIDE_DEPTH; d++) {
        const baseCol = seat.seatCol + dCol * d
        const baseRow = seat.seatRow + dRow * d
        if (dCol !== 0) {
          // Facing left/right: check tiles above and below
          autoOnTiles.add(`${baseCol},${baseRow - 1}`)
          autoOnTiles.add(`${baseCol},${baseRow + 1}`)
        } else {
          // Facing up/down: check tiles left and right
          autoOnTiles.add(`${baseCol - 1},${baseRow}`)
          autoOnTiles.add(`${baseCol + 1},${baseRow}`)
        }
      }
    }

    if (autoOnTiles.size === 0) {
      this.furniture = layoutToFurnitureInstances(this.layout.furniture)
      return
    }

    // Build modified furniture list with auto-state applied
    const modifiedFurniture: PlacedFurniture[] = this.layout.furniture.map((item) => {
      const entry = getCatalogEntry(item.type)
      if (!entry) return item
      // Check if any tile of this furniture overlaps an auto-on tile
      for (let dr = 0; dr < entry.footprintH; dr++) {
        for (let dc = 0; dc < entry.footprintW; dc++) {
          if (autoOnTiles.has(`${item.col + dc},${item.row + dr}`)) {
            const onType = getOnStateType(item.type)
            if (onType !== item.type) {
              return { ...item, type: onType }
            }
            return item
          }
        }
      }
      return item
    })

    this.furniture = layoutToFurnitureInstances(modifiedFurniture)
  }

  setAgentTool(id: number, tool: string | null): void {
    const ch = this.characters.get(id)
    if (ch) {
      ch.currentTool = tool
    }
  }

  // ── Meeting methods ────────────────────────────────────────

  getMeetingZones(): Array<{ col: number; row: number }> {
    const zones: Array<{ col: number; row: number }> = []
    for (const f of this.layout.furniture) {
      if (f.type === FurnitureType.MEETING_TABLE) {
        zones.push({ col: f.col, row: f.row })
      }
    }
    return zones
  }

  startMeeting(agentIds: number[]): void {
    if (agentIds.length < 2) return
    const zones = this.getMeetingZones()
    if (zones.length === 0) return

    // Pick the first available zone
    const zone = zones[this.nextMeetingId % zones.length]
    const groupId = `meeting-${this.nextMeetingId++}`
    const duration = MEETING_DURATION_MIN_SEC + Math.random() * (MEETING_DURATION_MAX_SEC - MEETING_DURATION_MIN_SEC)
    this.meetingTimers.set(groupId, duration)

    // Find walkable tiles around the meeting table (2x2 footprint)
    const adjacentTiles: Array<{ col: number; row: number }> = []
    for (let dr = -1; dr <= 2; dr++) {
      for (let dc = -1; dc <= 2; dc++) {
        if (dr >= 0 && dr <= 1 && dc >= 0 && dc <= 1) continue // table footprint
        const tc = zone.col + dc
        const tr = zone.row + dr
        if (tc >= 0 && tc < this.layout.cols && tr >= 0 && tr < this.layout.rows) {
          const key = `${tc},${tr}`
          if (!this.blockedTiles.has(key) && this.tileMap[tr]?.[tc] !== undefined && this.tileMap[tr][tc] > 0) {
            adjacentTiles.push({ col: tc, row: tr })
          }
        }
      }
    }

    let tileIdx = 0
    for (const id of agentIds) {
      const ch = this.characters.get(id)
      if (!ch || ch.matrixEffect) continue
      if (adjacentTiles.length === 0) break

      const target = adjacentTiles[tileIdx % adjacentTiles.length]
      tileIdx++

      ch.meetingGroupId = groupId
      ch.meetingTargetCol = target.col
      ch.meetingTargetRow = target.row

      // Pathfind to meeting spot
      const path = this.withOwnSeatUnblocked(ch, () =>
        findPath(ch.tileCol, ch.tileRow, target.col, target.row, this.tileMap, this.blockedTiles)
      )
      if (path.length > 0) {
        ch.path = path
        ch.moveProgress = 0
        ch.state = CharacterState.WALK
        ch.frame = 0
        ch.frameTimer = 0
      } else {
        // Already at target or can't reach — start meeting in place
        ch.state = CharacterState.MEET
        ch.frame = 0
        ch.frameTimer = 0
        ch.bubbleType = 'meeting'
        ch.bubbleTimer = 0
      }
    }
  }

  endMeeting(groupId: string): void {
    this.meetingTimers.delete(groupId)
    for (const ch of Array.from(this.characters.values())) {
      if (ch.meetingGroupId === groupId) {
        ch.meetingGroupId = null
        ch.meetingTargetCol = null
        ch.meetingTargetRow = null
        // MEET state handler will detect null groupId and walk back to seat
      }
    }
  }

  // ── Drink methods ──────────────────────────────────────────

  sendToCooler(id: number): void {
    const ch = this.characters.get(id)
    if (!ch || ch.matrixEffect) return

    const coolerTile = this.findCoolerAdjacentTile()
    if (!coolerTile) return

    ch.drinkTimer = DRINK_DURATION_SEC

    const path = this.withOwnSeatUnblocked(ch, () =>
      findPath(ch.tileCol, ch.tileRow, coolerTile.col, coolerTile.row, this.tileMap, this.blockedTiles)
    )
    if (path.length > 0) {
      ch.path = path
      ch.moveProgress = 0
      ch.state = CharacterState.WALK
      ch.frame = 0
      ch.frameTimer = 0
    }
  }

  private findCoolerAdjacentTile(): { col: number; row: number } | null {
    for (const f of this.layout.furniture) {
      if (f.type === FurnitureType.COOLER) {
        // Find walkable tile adjacent to cooler
        const offsets = [
          { dc: -1, dr: 0 }, { dc: 1, dr: 0 },
          { dc: 0, dr: -1 }, { dc: 0, dr: 1 },
        ]
        for (const { dc, dr } of offsets) {
          const tc = f.col + dc
          const tr = f.row + dr
          const key = `${tc},${tr}`
          if (!this.blockedTiles.has(key) && this.tileMap[tr]?.[tc] !== undefined && this.tileMap[tr][tc] > 0) {
            return { col: tc, row: tr }
          }
        }
      }
    }
    return null
  }

  // ── Error methods ──────────────────────────────────────────

  setAgentError(id: number): void {
    const ch = this.characters.get(id)
    if (!ch || ch.matrixEffect) return
    ch.errorTimer = ERROR_BUBBLE_DURATION_SEC
    ch.bubbleType = 'error'
    ch.bubbleTimer = ERROR_BUBBLE_DURATION_SEC
    if (ch.state === CharacterState.TYPE || ch.state === CharacterState.IDLE) {
      ch.state = CharacterState.ERROR
      ch.frame = 0
      ch.frameTimer = 0
    }
  }

  // ── Sleep methods ──────────────────────────────────────────

  setAgentSleep(id: number): void {
    const ch = this.characters.get(id)
    if (!ch || ch.matrixEffect || ch.isActive) return
    if (ch.sleepMode) return // already sleeping
    ch.sleepMode = true
    ch.opacity = SLEEP_OPACITY
    ch.bubbleType = 'sleep'
    ch.bubbleTimer = 0

    // If currently at seat, switch to SLEEP state
    if (ch.seatId) {
      const seat = this.seats.get(ch.seatId)
      if (seat && ch.tileCol === seat.seatCol && ch.tileRow === seat.seatRow) {
        ch.state = CharacterState.SLEEP
        ch.frame = 0
        ch.frameTimer = 0
        return
      }
    }
    // Walk to seat first, then sleep
    if (ch.seatId) {
      const seat = this.seats.get(ch.seatId)
      if (seat) {
        const path = this.withOwnSeatUnblocked(ch, () =>
          findPath(ch.tileCol, ch.tileRow, seat.seatCol, seat.seatRow, this.tileMap, this.blockedTiles)
        )
        if (path.length > 0) {
          ch.path = path
          ch.moveProgress = 0
          ch.state = CharacterState.WALK
          ch.frame = 0
          ch.frameTimer = 0
          return
        }
      }
    }
    ch.state = CharacterState.SLEEP
    ch.frame = 0
    ch.frameTimer = 0
  }

  update(dt: number): void {
    const toDelete: number[] = []
    for (const ch of Array.from(this.characters.values())) {
      // Handle matrix effect animation
      if (ch.matrixEffect) {
        ch.matrixEffectTimer += dt
        if (ch.matrixEffectTimer >= MATRIX_EFFECT_DURATION) {
          if (ch.matrixEffect === 'spawn') {
            // Spawn complete — clear effect, resume normal FSM
            ch.matrixEffect = null
            ch.matrixEffectTimer = 0
            ch.matrixEffectSeeds = []
          } else {
            // Despawn complete — mark for deletion
            toDelete.push(ch.id)
          }
        }
        continue // skip normal FSM while effect is active
      }

      // Temporarily unblock own seat so character can pathfind to it
      this.withOwnSeatUnblocked(ch, () =>
        updateCharacter(ch, dt, this.walkableTiles, this.seats, this.tileMap, this.blockedTiles)
      )

      // Tick bubble timer for waiting bubbles
      if (ch.bubbleType === 'waiting') {
        ch.bubbleTimer -= dt
        if (ch.bubbleTimer <= 0) {
          ch.bubbleType = null
          ch.bubbleTimer = 0
        }
      }

      // IDLE characters: random chance to go get water
      if (ch.state === CharacterState.IDLE && !ch.isActive && ch.drinkTimer <= 0 && !ch.meetingGroupId && !ch.sleepMode) {
        if (ch.wanderTimer <= 0 && Math.random() < DRINK_CHANCE_PER_WANDER) {
          this.sendToCooler(ch.id)
        }
      }
    }

    // Tick meeting timers and end expired meetings
    for (const [groupId, remaining] of Array.from(this.meetingTimers.entries())) {
      const newRemaining = remaining - dt
      if (newRemaining <= 0) {
        this.endMeeting(groupId)
      } else {
        this.meetingTimers.set(groupId, newRemaining)
      }
    }

    // Remove characters that finished despawn
    for (const id of toDelete) {
      this.characters.delete(id)
    }
  }

  getCharacters(): Character[] {
    return Array.from(this.characters.values())
  }

  /** Get character at pixel position (for hit testing). Returns id or null. */
  getCharacterAt(worldX: number, worldY: number): number | null {
    const chars = this.getCharacters().sort((a, b) => b.y - a.y)
    for (const ch of chars) {
      // Skip characters that are despawning
      if (ch.matrixEffect === 'despawn') continue
      // Character sprite is 16x24, anchored bottom-center
      // Apply sitting offset to match visual position
      const isSitting = ch.state === CharacterState.TYPE || ch.state === CharacterState.SLEEP || ch.state === CharacterState.ERROR
      const sittingOffset = isSitting ? CHARACTER_SITTING_OFFSET_PX : 0
      const anchorY = ch.y + sittingOffset
      const left = ch.x - CHARACTER_HIT_HALF_WIDTH
      const right = ch.x + CHARACTER_HIT_HALF_WIDTH
      const top = anchorY - CHARACTER_HIT_HEIGHT
      const bottom = anchorY
      if (worldX >= left && worldX <= right && worldY >= top && worldY <= bottom) {
        return ch.id
      }
    }
    return null
  }
}
