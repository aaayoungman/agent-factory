import { TileType, TILE_SIZE, CharacterState } from '../pixel-types'
import type { TileType as TileTypeVal, FurnitureInstance, Character, SpriteData, Seat, FloorColor, RoomLabel } from '../pixel-types'
import { getCachedSprite, getOutlineSprite } from '../sprites/spriteCache'
import {
  getCharacterSprites,
  BUBBLE_PERMISSION_SPRITE,
  BUBBLE_WAITING_SPRITE,
  BUBBLE_ERROR_SPRITE,
  BUBBLE_SLEEP_SPRITE,
  BUBBLE_MEETING_SPRITE,
} from '../sprites/spriteData'
import { getCharacterSprite } from './characters'
import { renderMatrixEffect } from './matrixEffect'
import { getColorizedFloorSprite, hasFloorSprites, WALL_COLOR } from '../floorTiles'
import { hasWallSprites, getWallInstances, wallColorToHex } from '../wallTiles'
import {
  CHARACTER_SITTING_OFFSET_PX,
  CHARACTER_Z_SORT_OFFSET,
  OUTLINE_Z_SORT_OFFSET,
  SELECTED_OUTLINE_ALPHA,
  HOVERED_OUTLINE_ALPHA,
  BUBBLE_FADE_DURATION_SEC,
  BUBBLE_SITTING_OFFSET_PX,
  BUBBLE_VERTICAL_OFFSET_PX,
  FALLBACK_FLOOR_COLOR,
  SEAT_OWN_COLOR,
  SEAT_AVAILABLE_COLOR,
  SEAT_BUSY_COLOR,
  ERROR_BUBBLE_DURATION_SEC,
  COLLAB_LINE_DASH,
  COLLAB_LINE_WIDTH,
} from '../pixel-constants'

// ── Render functions ────────────────────────────────────────────

export function renderTileGrid(
  ctx: CanvasRenderingContext2D,
  tileMap: TileTypeVal[][],
  offsetX: number,
  offsetY: number,
  zoom: number,
  tileColors?: Array<FloorColor | null>,
  cols?: number,
): void {
  const s = TILE_SIZE * zoom
  const useSpriteFloors = hasFloorSprites()
  const tmRows = tileMap.length
  const tmCols = tmRows > 0 ? tileMap[0].length : 0
  const layoutCols = cols ?? tmCols

  // Floor tiles + wall base color
  for (let r = 0; r < tmRows; r++) {
    for (let c = 0; c < tmCols; c++) {
      const tile = tileMap[r][c]

      // Skip VOID tiles entirely (transparent)
      if (tile === TileType.VOID) continue

      if (tile === TileType.WALL || !useSpriteFloors) {
        // Wall tiles or fallback: solid color
        if (tile === TileType.WALL) {
          const colorIdx = r * layoutCols + c
          const wallColor = tileColors?.[colorIdx]
          ctx.fillStyle = wallColor ? wallColorToHex(wallColor) : WALL_COLOR
        } else {
          ctx.fillStyle = FALLBACK_FLOOR_COLOR
        }
        ctx.fillRect(offsetX + c * s, offsetY + r * s, s, s)
        continue
      }

      // Floor tile: get colorized sprite
      const colorIdx = r * layoutCols + c
      const color = tileColors?.[colorIdx] ?? { h: 0, s: 0, b: 0, c: 0 }
      const sprite = getColorizedFloorSprite(tile, color)
      const cached = getCachedSprite(sprite, zoom)
      ctx.drawImage(cached, offsetX + c * s, offsetY + r * s)
    }
  }
}

interface ZDrawable {
  zY: number
  draw: (ctx: CanvasRenderingContext2D) => void
}

export function renderScene(
  ctx: CanvasRenderingContext2D,
  furniture: FurnitureInstance[],
  characters: Character[],
  offsetX: number,
  offsetY: number,
  zoom: number,
  selectedAgentId: number | null,
  hoveredAgentId: number | null,
): void {
  const drawables: ZDrawable[] = []

  // Furniture
  for (const f of furniture) {
    const cached = getCachedSprite(f.sprite, zoom)
    const fx = offsetX + f.x * zoom
    const fy = offsetY + f.y * zoom
    drawables.push({
      zY: f.zY,
      draw: (c) => {
        c.drawImage(cached, fx, fy)
      },
    })
  }

  // Characters
  for (const ch of characters) {
    const sprites = getCharacterSprites(ch.palette, ch.hueShift)
    const spriteData = getCharacterSprite(ch, sprites)
    const cached = getCachedSprite(spriteData, zoom)
    // Sitting offset: shift character down when seated so they visually sit in the chair
    const isSitting = ch.state === CharacterState.TYPE || ch.state === CharacterState.SLEEP || ch.state === CharacterState.ERROR
    const sittingOffset = isSitting ? CHARACTER_SITTING_OFFSET_PX : 0
    // Anchor at bottom-center of character — round to integer device pixels
    const drawX = Math.round(offsetX + ch.x * zoom - cached.width / 2)
    const drawY = Math.round(offsetY + (ch.y + sittingOffset) * zoom - cached.height)

    // Sort characters by bottom of their tile (not center) so they render
    // in front of same-row furniture (e.g. chairs) but behind furniture
    // at lower rows (e.g. desks, bookshelves that occlude from below).
    const charZY = ch.y + TILE_SIZE / 2 + CHARACTER_Z_SORT_OFFSET

    // Matrix spawn/despawn effect — skip outline, use per-pixel rendering
    if (ch.matrixEffect) {
      const mDrawX = drawX
      const mDrawY = drawY
      const mSpriteData = spriteData
      const mCh = ch
      drawables.push({
        zY: charZY,
        draw: (c) => {
          renderMatrixEffect(c, mCh, mSpriteData, mDrawX, mDrawY, zoom)
        },
      })
      continue
    }

    // White outline: full opacity for selected, 50% for hover
    const isSelected = selectedAgentId !== null && ch.id === selectedAgentId
    const isHovered = hoveredAgentId !== null && ch.id === hoveredAgentId
    if (isSelected || isHovered) {
      const outlineAlpha = isSelected ? SELECTED_OUTLINE_ALPHA : HOVERED_OUTLINE_ALPHA
      const outlineData = getOutlineSprite(spriteData)
      const outlineCached = getCachedSprite(outlineData, zoom)
      const olDrawX = drawX - zoom  // 1 sprite-pixel offset, scaled
      const olDrawY = drawY - zoom  // outline follows sitting offset via drawY
      drawables.push({
        zY: charZY - OUTLINE_Z_SORT_OFFSET, // sort just before character
        draw: (c) => {
          c.save()
          c.globalAlpha = outlineAlpha
          c.drawImage(outlineCached, olDrawX, olDrawY)
          c.restore()
        },
      })
    }

    const charOpacity = ch.opacity
    drawables.push({
      zY: charZY,
      draw: (c) => {
        if (charOpacity < 1.0) {
          c.save()
          c.globalAlpha = charOpacity
          c.drawImage(cached, drawX, drawY)
          c.restore()
        } else {
          c.drawImage(cached, drawX, drawY)
        }
      },
    })
  }

  // Sort by Y (lower = in front = drawn later)
  drawables.sort((a, b) => a.zY - b.zY)

  for (const d of drawables) {
    d.draw(ctx)
  }
}

// ── Seat indicators ─────────────────────────────────────────────

export function renderSeatIndicators(
  ctx: CanvasRenderingContext2D,
  seats: Map<string, Seat>,
  characters: Map<number, Character>,
  selectedAgentId: number | null,
  hoveredTile: { col: number; row: number } | null,
  offsetX: number,
  offsetY: number,
  zoom: number,
): void {
  if (selectedAgentId === null || !hoveredTile) return
  const selectedChar = characters.get(selectedAgentId)
  if (!selectedChar) return

  // Only show indicator for the hovered seat tile
  for (const [uid, seat] of Array.from(seats.entries())) {
    if (seat.seatCol !== hoveredTile.col || seat.seatRow !== hoveredTile.row) continue

    const s = TILE_SIZE * zoom
    const x = offsetX + seat.seatCol * s
    const y = offsetY + seat.seatRow * s

    if (selectedChar.seatId === uid) {
      // Selected agent's own seat — blue
      ctx.fillStyle = SEAT_OWN_COLOR
    } else if (!seat.assigned) {
      // Available seat — green
      ctx.fillStyle = SEAT_AVAILABLE_COLOR
    } else {
      // Busy (assigned to another agent) — red
      ctx.fillStyle = SEAT_BUSY_COLOR
    }
    ctx.fillRect(x, y, s, s)
    break
  }
}

// ── Speech bubbles ──────────────────────────────────────────────

export function renderBubbles(
  ctx: CanvasRenderingContext2D,
  characters: Character[],
  offsetX: number,
  offsetY: number,
  zoom: number,
): void {
  for (const ch of characters) {
    if (!ch.bubbleType) continue

    let sprite
    switch (ch.bubbleType) {
      case 'permission': sprite = BUBBLE_PERMISSION_SPRITE; break
      case 'waiting': sprite = BUBBLE_WAITING_SPRITE; break
      case 'error': sprite = BUBBLE_ERROR_SPRITE; break
      case 'sleep': sprite = BUBBLE_SLEEP_SPRITE; break
      case 'meeting': sprite = BUBBLE_MEETING_SPRITE; break
      default: continue
    }

    // Compute opacity per bubble type
    let alpha = 1.0
    if (ch.bubbleType === 'waiting' && ch.bubbleTimer < BUBBLE_FADE_DURATION_SEC) {
      alpha = ch.bubbleTimer / BUBBLE_FADE_DURATION_SEC
    } else if (ch.bubbleType === 'error' && ch.errorTimer < 2.0) {
      // Fade out in last 2 seconds
      alpha = ch.errorTimer / 2.0
    } else if (ch.bubbleType === 'sleep') {
      // Slow pulsing
      alpha = 0.6 + 0.4 * Math.sin(Date.now() / 1000)
    }

    const cached = getCachedSprite(sprite, zoom)
    // Position: centered above the character's head
    const isSitting = ch.state === CharacterState.TYPE || ch.state === CharacterState.SLEEP || ch.state === CharacterState.ERROR
    const sittingOff = isSitting ? BUBBLE_SITTING_OFFSET_PX : 0
    const bubbleX = Math.round(offsetX + ch.x * zoom - cached.width / 2)
    const bubbleY = Math.round(offsetY + (ch.y + sittingOff - BUBBLE_VERTICAL_OFFSET_PX) * zoom - cached.height - 1 * zoom)

    ctx.save()
    if (alpha < 1.0) ctx.globalAlpha = Math.max(0, alpha)
    ctx.drawImage(cached, bubbleX, bubbleY)
    ctx.restore()
  }
}

// ── Collaboration lines ────────────────────────────────────────

export interface CollaborationLink {
  fromAgentId: number
  toAgentId: number
  type: 'spawn' | 'send'
}

export function renderCollaborationLines(
  ctx: CanvasRenderingContext2D,
  links: CollaborationLink[],
  characters: Map<number, Character>,
  offsetX: number,
  offsetY: number,
  zoom: number,
): void {
  if (links.length === 0) return

  ctx.save()
  ctx.setLineDash(COLLAB_LINE_DASH.map(v => v * zoom))
  ctx.lineWidth = COLLAB_LINE_WIDTH * zoom

  for (const link of links) {
    const from = characters.get(link.fromAgentId)
    const to = characters.get(link.toAgentId)
    if (!from || !to) continue
    if (from.matrixEffect === 'despawn' || to.matrixEffect === 'despawn') continue

    // Line color: blue for spawn (parent→child), green for send (child→parent)
    ctx.strokeStyle = link.type === 'spawn' ? 'rgba(68, 136, 204, 0.6)' : 'rgba(68, 187, 102, 0.6)'

    // Connect above characters' heads
    const fromX = offsetX + from.x * zoom
    const fromY = offsetY + (from.y - 20) * zoom
    const toX = offsetX + to.x * zoom
    const toY = offsetY + (to.y - 20) * zoom

    ctx.beginPath()
    ctx.moveTo(fromX, fromY)
    ctx.lineTo(toX, toY)
    ctx.stroke()
  }

  ctx.restore()
}

export interface SelectionRenderState {
  selectedAgentId: number | null
  hoveredAgentId: number | null
  hoveredTile: { col: number; row: number } | null
  seats: Map<string, Seat>
  characters: Map<number, Character>
}

export function renderRoomLabels(
  ctx: CanvasRenderingContext2D,
  labels: RoomLabel[],
  offsetX: number,
  offsetY: number,
  zoom: number,
): void {
  if (labels.length === 0) return
  const s = TILE_SIZE * zoom

  for (const label of labels) {
    const x = offsetX + label.col * s
    const y = offsetY + label.row * s
    const w = label.width * s

    // Draw label background (semi-transparent dark bar on top wall)
    ctx.save()
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)'
    ctx.fillRect(x, y, w, s)

    // Draw emoji + text centered
    const fontSize = Math.max(8, Math.min(12, 3 * zoom))
    ctx.font = `${fontSize}px sans-serif`
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const text = `${label.emoji} ${label.text}`
    ctx.fillText(text, x + w / 2, y + s / 2, w - 4)
    ctx.restore()
  }
}

export function renderFrame(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  tileMap: TileTypeVal[][],
  furniture: FurnitureInstance[],
  characters: Character[],
  zoom: number,
  panX: number,
  panY: number,
  selection?: SelectionRenderState,
  tileColors?: Array<FloorColor | null>,
  layoutCols?: number,
  layoutRows?: number,
  collaborationLinks?: CollaborationLink[],
  roomLabels?: RoomLabel[],
): { offsetX: number; offsetY: number } {
  // Clear
  ctx.clearRect(0, 0, canvasWidth, canvasHeight)

  // Use layout dimensions (fallback to tileMap size)
  const cols = layoutCols ?? (tileMap.length > 0 ? tileMap[0].length : 0)
  const rows = layoutRows ?? tileMap.length

  // Center map in viewport + pan offset (integer device pixels)
  const mapW = cols * TILE_SIZE * zoom
  const mapH = rows * TILE_SIZE * zoom
  const offsetX = Math.floor((canvasWidth - mapW) / 2) + Math.round(panX)
  const offsetY = Math.floor((canvasHeight - mapH) / 2) + Math.round(panY)

  // Draw tiles (floor + wall base color)
  renderTileGrid(ctx, tileMap, offsetX, offsetY, zoom, tileColors, layoutCols)

  // Room labels (on top of wall tiles, before furniture)
  if (roomLabels && roomLabels.length > 0) {
    renderRoomLabels(ctx, roomLabels, offsetX, offsetY, zoom)
  }

  // Seat indicators (below furniture/characters, on top of floor)
  if (selection) {
    renderSeatIndicators(ctx, selection.seats, selection.characters, selection.selectedAgentId, selection.hoveredTile, offsetX, offsetY, zoom)
  }

  // Build wall instances for z-sorting with furniture and characters
  const wallInstances = hasWallSprites()
    ? getWallInstances(tileMap, tileColors, layoutCols)
    : []
  const allFurniture = wallInstances.length > 0
    ? [...wallInstances, ...furniture]
    : furniture

  // Draw walls + furniture + characters (z-sorted)
  const selectedId = selection?.selectedAgentId ?? null
  const hoveredId = selection?.hoveredAgentId ?? null
  renderScene(ctx, allFurniture, characters, offsetX, offsetY, zoom, selectedId, hoveredId)

  // Collaboration lines between communicating agents
  if (collaborationLinks && collaborationLinks.length > 0 && selection?.characters) {
    renderCollaborationLines(ctx, collaborationLinks, selection.characters, offsetX, offsetY, zoom)
  }

  // Speech bubbles (always on top of characters)
  renderBubbles(ctx, characters, offsetX, offsetY, zoom)

  return { offsetX, offsetY }
}
