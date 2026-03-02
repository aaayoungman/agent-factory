import type { SpriteData, FloorColor } from './pixel-types'
import { TILE_SIZE } from './pixel-types'
import { getColorizedSprite } from './colorize'
import { FALLBACK_FLOOR_COLOR } from './pixel-constants'

const DEFAULT_FLOOR_SPRITE: SpriteData = Array.from(
  { length: TILE_SIZE },
  () => Array(TILE_SIZE).fill(FALLBACK_FLOOR_COLOR) as string[],
)

export const WALL_COLOR = '#3A3A5C'

export function hasFloorSprites(): boolean {
  return true
}

export function getColorizedFloorSprite(patternIndex: number, color: FloorColor): SpriteData {
  const key = `floor-${patternIndex}-${color.h}-${color.s}-${color.b}-${color.c}`
  return getColorizedSprite(key, DEFAULT_FLOOR_SPRITE, { ...color, colorize: true })
}
