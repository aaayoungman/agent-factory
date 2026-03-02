import { TileType, FurnitureType } from '../pixel-types'
import type { TileType as TileTypeVal, OfficeLayout, PlacedFurniture, FloorColor, RoomLabel } from '../pixel-types'
import type { Department } from '@/lib/types'

const DEFAULT_LEFT_ROOM_COLOR: FloorColor = { h: 35, s: 30, b: 15, c: 0 }
const DEFAULT_RIGHT_ROOM_COLOR: FloorColor = { h: 25, s: 45, b: 5, c: 10 }
const DEFAULT_CARPET_COLOR: FloorColor = { h: 280, s: 40, b: -5, c: 0 }
const DEFAULT_DOORWAY_COLOR: FloorColor = { h: 35, s: 25, b: 10, c: 0 }

type LayoutSize = 'small' | 'medium' | 'large'

export function getLayoutSize(agentCount: number): LayoutSize {
  if (agentCount <= 8) return 'small'
  if (agentCount <= 16) return 'medium'
  return 'large'
}

export function generateLayout(size: LayoutSize): OfficeLayout {
  switch (size) {
    case 'small': return generateSmallLayout()
    case 'medium': return generateMediumLayout()
    case 'large': return generateLargeLayout()
  }
}

function generateSmallLayout(): OfficeLayout {
  const cols = 20
  const rows = 11
  const W = TileType.WALL
  const F1 = TileType.FLOOR_1
  const F2 = TileType.FLOOR_2
  const F3 = TileType.FLOOR_3
  const F4 = TileType.FLOOR_4

  const tiles: TileTypeVal[] = []
  const tileColors: Array<FloorColor | null> = []

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (r === 0 || r === rows - 1) { tiles.push(W); tileColors.push(null); continue }
      if (c === 0 || c === cols - 1) { tiles.push(W); tileColors.push(null); continue }
      if (c === 10) {
        if (r >= 4 && r <= 6) {
          tiles.push(F4); tileColors.push(DEFAULT_DOORWAY_COLOR)
        } else {
          tiles.push(W); tileColors.push(null)
        }
        continue
      }
      if (c >= 15 && c <= 18 && r >= 7 && r <= 9) {
        tiles.push(F3); tileColors.push(DEFAULT_CARPET_COLOR); continue
      }
      if (c < 10) {
        tiles.push(F1); tileColors.push(DEFAULT_LEFT_ROOM_COLOR)
      } else {
        tiles.push(F2); tileColors.push(DEFAULT_RIGHT_ROOM_COLOR)
      }
    }
  }

  const furniture: PlacedFurniture[] = [
    { uid: 'desk-left', type: FurnitureType.DESK, col: 4, row: 3 },
    { uid: 'desk-right', type: FurnitureType.DESK, col: 13, row: 3 },
    { uid: 'bookshelf-1', type: FurnitureType.BOOKSHELF, col: 1, row: 5 },
    { uid: 'plant-left', type: FurnitureType.PLANT, col: 1, row: 1 },
    { uid: 'cooler-1', type: FurnitureType.COOLER, col: 18, row: 9 },
    { uid: 'meeting-table-1', type: FurnitureType.MEETING_TABLE, col: 15, row: 7 },
    { uid: 'plant-right', type: FurnitureType.PLANT, col: 18, row: 1 },
    { uid: 'whiteboard-1', type: FurnitureType.WHITEBOARD, col: 15, row: 0 },
    { uid: 'chair-l-top', type: FurnitureType.CHAIR, col: 4, row: 2 },
    { uid: 'chair-l-bottom', type: FurnitureType.CHAIR, col: 5, row: 5 },
    { uid: 'chair-l-left', type: FurnitureType.CHAIR, col: 3, row: 4 },
    { uid: 'chair-l-right', type: FurnitureType.CHAIR, col: 6, row: 3 },
    { uid: 'chair-r-top', type: FurnitureType.CHAIR, col: 13, row: 2 },
    { uid: 'chair-r-bottom', type: FurnitureType.CHAIR, col: 14, row: 5 },
    { uid: 'chair-r-left', type: FurnitureType.CHAIR, col: 12, row: 4 },
    { uid: 'chair-r-right', type: FurnitureType.CHAIR, col: 15, row: 3 },
  ]

  return { version: 1, cols, rows, tiles, tileColors, furniture }
}

function generateMediumLayout(): OfficeLayout {
  const cols = 30
  const rows = 15
  const W = TileType.WALL
  const F1 = TileType.FLOOR_1
  const F2 = TileType.FLOOR_2
  const F3 = TileType.FLOOR_3
  const F4 = TileType.FLOOR_4

  const tiles: TileTypeVal[] = []
  const tileColors: Array<FloorColor | null> = []

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (r === 0 || r === rows - 1) { tiles.push(W); tileColors.push(null); continue }
      if (c === 0 || c === cols - 1) { tiles.push(W); tileColors.push(null); continue }
      if (c === 10 || c === 20) {
        if (r >= 5 && r <= 9) {
          tiles.push(F4); tileColors.push(DEFAULT_DOORWAY_COLOR)
        } else {
          tiles.push(W); tileColors.push(null)
        }
        continue
      }
      if (c >= 23 && c <= 28 && r >= 10 && r <= 13) {
        tiles.push(F3); tileColors.push(DEFAULT_CARPET_COLOR); continue
      }
      if (c < 10) {
        tiles.push(F1); tileColors.push(DEFAULT_LEFT_ROOM_COLOR)
      } else if (c < 20) {
        tiles.push(F2); tileColors.push(DEFAULT_RIGHT_ROOM_COLOR)
      } else {
        tiles.push(F1); tileColors.push(DEFAULT_LEFT_ROOM_COLOR)
      }
    }
  }

  const furniture: PlacedFurniture[] = [
    // Room 1 (left)
    { uid: 'desk-1', type: FurnitureType.DESK, col: 4, row: 3 },
    { uid: 'chair-1a', type: FurnitureType.CHAIR, col: 4, row: 2 },
    { uid: 'chair-1b', type: FurnitureType.CHAIR, col: 5, row: 5 },
    { uid: 'chair-1c', type: FurnitureType.CHAIR, col: 3, row: 4 },
    { uid: 'chair-1d', type: FurnitureType.CHAIR, col: 6, row: 3 },
    { uid: 'desk-2', type: FurnitureType.DESK, col: 4, row: 8 },
    { uid: 'chair-2a', type: FurnitureType.CHAIR, col: 4, row: 7 },
    { uid: 'chair-2b', type: FurnitureType.CHAIR, col: 5, row: 10 },
    { uid: 'chair-2c', type: FurnitureType.CHAIR, col: 3, row: 9 },
    { uid: 'chair-2d', type: FurnitureType.CHAIR, col: 6, row: 8 },
    // Room 2 (middle)
    { uid: 'desk-3', type: FurnitureType.DESK, col: 14, row: 3 },
    { uid: 'chair-3a', type: FurnitureType.CHAIR, col: 14, row: 2 },
    { uid: 'chair-3b', type: FurnitureType.CHAIR, col: 15, row: 5 },
    { uid: 'chair-3c', type: FurnitureType.CHAIR, col: 13, row: 4 },
    { uid: 'chair-3d', type: FurnitureType.CHAIR, col: 16, row: 3 },
    // Room 3 (right)
    { uid: 'desk-4', type: FurnitureType.DESK, col: 24, row: 3 },
    { uid: 'chair-4a', type: FurnitureType.CHAIR, col: 24, row: 2 },
    { uid: 'chair-4b', type: FurnitureType.CHAIR, col: 25, row: 5 },
    { uid: 'chair-4c', type: FurnitureType.CHAIR, col: 23, row: 4 },
    { uid: 'chair-4d', type: FurnitureType.CHAIR, col: 26, row: 3 },
    // Decor
    { uid: 'bookshelf-1', type: FurnitureType.BOOKSHELF, col: 1, row: 5 },
    { uid: 'plant-1', type: FurnitureType.PLANT, col: 1, row: 1 },
    { uid: 'plant-2', type: FurnitureType.PLANT, col: 28, row: 1 },
    { uid: 'cooler-1', type: FurnitureType.COOLER, col: 27, row: 10 },
    { uid: 'meeting-table-1', type: FurnitureType.MEETING_TABLE, col: 24, row: 11 },
    { uid: 'whiteboard-1', type: FurnitureType.WHITEBOARD, col: 14, row: 0 },
  ]

  return { version: 1, cols, rows, tiles, tileColors, furniture }
}

function generateLargeLayout(): OfficeLayout {
  const cols = 40
  const rows = 20
  const W = TileType.WALL
  const F1 = TileType.FLOOR_1
  const F2 = TileType.FLOOR_2
  const F3 = TileType.FLOOR_3
  const F4 = TileType.FLOOR_4

  const tiles: TileTypeVal[] = []
  const tileColors: Array<FloorColor | null> = []

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (r === 0 || r === rows - 1) { tiles.push(W); tileColors.push(null); continue }
      if (c === 0 || c === cols - 1) { tiles.push(W); tileColors.push(null); continue }
      if (c === 10 || c === 20 || c === 30) {
        if (r >= 6 && r <= 13) {
          tiles.push(F4); tileColors.push(DEFAULT_DOORWAY_COLOR)
        } else {
          tiles.push(W); tileColors.push(null)
        }
        continue
      }
      if (r === 10) {
        if (c >= 1 && c <= 9) {
          if (c >= 4 && c <= 6) {
            tiles.push(F4); tileColors.push(DEFAULT_DOORWAY_COLOR)
          } else {
            tiles.push(W); tileColors.push(null)
          }
          continue
        }
      }
      if (c >= 32 && c <= 38 && r >= 14 && r <= 18) {
        tiles.push(F3); tileColors.push(DEFAULT_CARPET_COLOR); continue
      }
      const section = Math.floor(c / 10) % 2
      if (section === 0) {
        tiles.push(F1); tileColors.push(DEFAULT_LEFT_ROOM_COLOR)
      } else {
        tiles.push(F2); tileColors.push(DEFAULT_RIGHT_ROOM_COLOR)
      }
    }
  }

  const furniture: PlacedFurniture[] = []
  let uid = 0
  const addDesk = (col: number, row: number) => {
    const id = ++uid
    furniture.push({ uid: `desk-${id}`, type: FurnitureType.DESK, col, row })
    furniture.push({ uid: `chair-${id}a`, type: FurnitureType.CHAIR, col, row: row - 1 })
    furniture.push({ uid: `chair-${id}b`, type: FurnitureType.CHAIR, col: col + 1, row: row + 2 })
    furniture.push({ uid: `chair-${id}c`, type: FurnitureType.CHAIR, col: col - 1, row: row + 1 })
    furniture.push({ uid: `chair-${id}d`, type: FurnitureType.CHAIR, col: col + 2, row })
  }
  // Room 1
  addDesk(4, 3)
  // Room 1 lower
  addDesk(4, 13)
  // Room 2
  addDesk(14, 3)
  addDesk(14, 8)
  // Room 3
  addDesk(24, 3)
  addDesk(24, 8)
  // Room 4
  addDesk(34, 3)
  addDesk(34, 8)
  // Decor
  furniture.push({ uid: 'bookshelf-1', type: FurnitureType.BOOKSHELF, col: 1, row: 5 })
  furniture.push({ uid: 'bookshelf-2', type: FurnitureType.BOOKSHELF, col: 1, row: 14 })
  furniture.push({ uid: 'plant-1', type: FurnitureType.PLANT, col: 1, row: 1 })
  furniture.push({ uid: 'plant-2', type: FurnitureType.PLANT, col: 38, row: 1 })
  furniture.push({ uid: 'plant-3', type: FurnitureType.PLANT, col: 38, row: 18 })
  furniture.push({ uid: 'cooler-1', type: FurnitureType.COOLER, col: 36, row: 14 })
  furniture.push({ uid: 'meeting-table-1', type: FurnitureType.MEETING_TABLE, col: 33, row: 15 })
  furniture.push({ uid: 'meeting-table-2', type: FurnitureType.MEETING_TABLE, col: 14, row: 13 })
  furniture.push({ uid: 'whiteboard-1', type: FurnitureType.WHITEBOARD, col: 14, row: 0 })
  furniture.push({ uid: 'whiteboard-2', type: FurnitureType.WHITEBOARD, col: 24, row: 0 })

  return { version: 1, cols, rows, tiles, tileColors, furniture }
}

// ── Department-based layout generator ─────────────────────────

export interface DepartmentRoomInput {
  department: Department
  agentCount: number
}

/** Calculate room dimensions based on furniture and agent count */
function calcRoomSize(input: DepartmentRoomInput): { w: number; h: number } {
  const deskCount = input.department.furniture.find(f => f.type === 'desk')?.count || 1
  const otherCount = input.department.furniture
    .filter(f => f.type !== 'desk' && f.type !== 'chair')
    .reduce((s, f) => s + f.count, 0)

  const desksPerRow = Math.min(deskCount, 2)
  const deskRows = Math.ceil(deskCount / desksPerRow)

  const baseW = Math.max(10, desksPerRow * 6 + 2 + Math.min(otherCount, 3))
  const baseH = Math.max(8, deskRows * 6 + 3)

  return { w: baseW, h: baseH }
}

/** Place furniture inside a room area */
function placeFurnitureInRoom(
  dept: Department,
  roomStartCol: number,
  roomStartRow: number,
  roomW: number,
  roomH: number,
): PlacedFurniture[] {
  const furniture: PlacedFurniture[] = []
  const occupied = new Set<string>()
  let uidCounter = 0

  const markOccupied = (col: number, row: number, w: number, h: number) => {
    for (let dr = 0; dr < h; dr++) {
      for (let dc = 0; dc < w; dc++) {
        occupied.add(`${col + dc},${row + dr}`)
      }
    }
  }

  const isAreaFree = (col: number, row: number, w: number, h: number): boolean => {
    for (let dr = 0; dr < h; dr++) {
      for (let dc = 0; dc < w; dc++) {
        if (occupied.has(`${col + dc},${row + dr}`)) return false
      }
    }
    return true
  }

  const addItem = (type: string, col: number, row: number, fw: number, fh: number) => {
    const uid = `${dept.id}-${type}-${uidCounter++}`
    furniture.push({ uid, type, col, row, roomId: dept.id })
    markOccupied(col, row, fw, fh)
  }

  // Interior area (inside walls)
  const iCol = roomStartCol + 1
  const iRow = roomStartRow + 1
  const iW = roomW - 2
  const iH = roomH - 2

  // 1. Place desks with chairs in center area
  const deskCount = dept.furniture.find(f => f.type === 'desk')?.count || 0
  let deskPlaced = 0
  const deskStartCol = iCol + 2
  const deskStartRow = iRow + 1
  for (let dr = 0; deskPlaced < deskCount && deskStartRow + dr * 5 + 2 <= iRow + iH - 1; dr++) {
    for (let dc = 0; deskPlaced < deskCount && deskStartCol + dc * 6 + 2 <= iCol + iW - 1; dc++) {
      const col = deskStartCol + dc * 6
      const row = deskStartRow + dr * 5
      if (!isAreaFree(col, row, 2, 2)) continue
      addItem(FurnitureType.DESK, col, row, 2, 2)
      const chairPositions = [
        { col: col, row: row - 1, fw: 1, fh: 1 },
        { col: col + 1, row: row + 2, fw: 1, fh: 1 },
        { col: col - 1, row: row + 1, fw: 1, fh: 1 },
        { col: col + 2, row: row, fw: 1, fh: 1 },
      ]
      for (const cp of chairPositions) {
        if (cp.col >= iCol && cp.col < iCol + iW && cp.row >= iRow && cp.row < iRow + iH) {
          if (isAreaFree(cp.col, cp.row, 1, 1)) {
            addItem(FurnitureType.CHAIR, cp.col, cp.row, 1, 1)
          }
        }
      }
      deskPlaced++
    }
  }

  // 2. Place wall/decoration furniture along edges
  for (const item of dept.furniture) {
    if (item.type === 'desk' || item.type === 'chair') continue
    let placed = 0
    for (let attempt = 0; placed < item.count && attempt < 30; attempt++) {
      let col: number, row: number, fw: number, fh: number
      switch (item.type) {
        case 'bookshelf':
          fw = 1; fh = 2
          col = iCol
          row = iRow + 1 + placed * 3
          break
        case 'whiteboard':
          fw = 2; fh = 1
          col = iCol + 2 + placed * 3
          row = roomStartRow
          break
        case 'plant':
          fw = 1; fh = 1
          if (placed === 0) { col = iCol; row = iRow }
          else if (placed === 1) { col = iCol + iW - 1; row = iRow }
          else { col = iCol + (attempt % iW); row = iRow + iH - 1 }
          break
        case 'cooler':
          fw = 1; fh = 1
          col = iCol + iW - 1
          row = iRow + iH - 1 - placed
          break
        case 'lamp':
          fw = 1; fh = 1
          col = iCol + iW - 1 - placed
          row = iRow
          break
        case 'meeting_table':
          fw = 2; fh = 2
          col = iCol + iW - 3
          row = iRow + iH - 3
          break
        default:
          fw = 1; fh = 1
          col = iCol + (attempt % iW)
          row = iRow + Math.floor(attempt / iW) % iH
          break
      }

      if (col >= roomStartCol && col + fw <= roomStartCol + roomW &&
          row >= roomStartRow && row + fh <= roomStartRow + roomH &&
          isAreaFree(col, row, fw, fh)) {
        addItem(item.type, col, row, fw, fh)
        placed++
      }
    }
  }

  return furniture
}

export function generateDepartmentLayout(rooms: DepartmentRoomInput[]): OfficeLayout {
  if (rooms.length === 0) {
    return generateLayout('small')
  }

  const W = TileType.WALL
  const F1 = TileType.FLOOR_1
  const F4 = TileType.FLOOR_4

  const roomSizes = rooms.map(r => calcRoomSize(r))

  // Arrange rooms left-to-right, wrap after MAX_WIDTH
  const MAX_WIDTH = 50
  const roomPositions: Array<{ col: number; row: number; w: number; h: number }> = []
  let curCol = 0
  let curRow = 0
  let maxRowHeight = 0

  for (let i = 0; i < roomSizes.length; i++) {
    const { w, h } = roomSizes[i]
    if (curCol > 0 && curCol + w > MAX_WIDTH) {
      curRow += maxRowHeight - 1
      curCol = 0
      maxRowHeight = 0
    }
    roomPositions.push({ col: curCol, row: curRow, w, h })
    curCol += w - 1
    if (h > maxRowHeight) maxRowHeight = h
  }

  let totalCols = 0
  let totalRows = 0
  for (const pos of roomPositions) {
    if (pos.col + pos.w > totalCols) totalCols = pos.col + pos.w
    if (pos.row + pos.h > totalRows) totalRows = pos.row + pos.h
  }

  const tiles: TileTypeVal[] = new Array(totalRows * totalCols).fill(TileType.VOID)
  const tileColors: Array<FloorColor | null> = new Array(totalRows * totalCols).fill(null)
  const furniture: PlacedFurniture[] = []
  const roomLabels: RoomLabel[] = []

  for (let i = 0; i < rooms.length; i++) {
    const { col: rc, row: rr, w: rw, h: rh } = roomPositions[i]
    const dept = rooms[i].department
    const floorColor: FloorColor = { ...dept.floorColor }

    for (let r = 0; r < rh; r++) {
      for (let c = 0; c < rw; c++) {
        const gr = rr + r
        const gc = rc + c
        const idx = gr * totalCols + gc
        const isEdge = r === 0 || r === rh - 1 || c === 0 || c === rw - 1

        if (isEdge) {
          const existing = tiles[idx]
          if (existing !== TileType.VOID && existing !== W) {
            // Already a floor from adjacent room — keep as doorway
          } else {
            tiles[idx] = W
            tileColors[idx] = null
          }
        } else {
          tiles[idx] = F1
          tileColors[idx] = floorColor
        }
      }
    }

    // Create doorways on shared walls
    for (let j = 0; j < i; j++) {
      const prev = roomPositions[j]
      // Shared vertical wall
      if (rc === prev.col + prev.w - 1 || prev.col === rc + rw - 1) {
        const sharedCol = rc === prev.col + prev.w - 1 ? rc : prev.col
        const overlapStart = Math.max(rr, prev.row) + 1
        const overlapEnd = Math.min(rr + rh, prev.row + prev.h) - 1
        const mid = Math.floor((overlapStart + overlapEnd) / 2)
        const doorStart = Math.max(overlapStart, mid - 1)
        const doorEnd = Math.min(overlapEnd - 1, mid + 1)
        for (let dr = doorStart; dr <= doorEnd; dr++) {
          const idx = dr * totalCols + sharedCol
          tiles[idx] = F4
          tileColors[idx] = { h: 35, s: 25, b: 10, c: 0 }
        }
      }
      // Shared horizontal wall
      if (rr === prev.row + prev.h - 1 || prev.row === rr + rh - 1) {
        const sharedRow = rr === prev.row + prev.h - 1 ? rr : prev.row
        const overlapStart = Math.max(rc, prev.col) + 1
        const overlapEnd = Math.min(rc + rw, prev.col + prev.w) - 1
        const mid = Math.floor((overlapStart + overlapEnd) / 2)
        const doorStart = Math.max(overlapStart, mid - 1)
        const doorEnd = Math.min(overlapEnd - 1, mid + 1)
        for (let dc = doorStart; dc <= doorEnd; dc++) {
          const idx = sharedRow * totalCols + dc
          tiles[idx] = F4
          tileColors[idx] = { h: 35, s: 25, b: 10, c: 0 }
        }
      }
    }

    const roomFurniture = placeFurnitureInRoom(dept, rc, rr, rw, rh)
    furniture.push(...roomFurniture)

    roomLabels.push({
      text: dept.nameEn,
      emoji: dept.emoji,
      col: rc + 1,
      row: rr,
      width: rw - 2,
    })
  }

  return { version: 1, cols: totalCols, rows: totalRows, tiles, tileColors, furniture, roomLabels }
}
