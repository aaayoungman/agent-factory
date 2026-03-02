import type { FurnitureInstance, FloorColor } from './pixel-types'
import type { TileType as TileTypeVal } from './pixel-types'

export function hasWallSprites(): boolean {
  return false
}

export function getWallInstances(
  _tileMap: TileTypeVal[][],
  _tileColors?: Array<FloorColor | null>,
  _cols?: number,
): FurnitureInstance[] {
  return []
}

export function wallColorToHex(color: FloorColor): string {
  const { h, s, b, c } = color
  let lightness = 0.5
  if (c !== 0) {
    const factor = (100 + c) / 100
    lightness = 0.5 + (lightness - 0.5) * factor
  }
  if (b !== 0) {
    lightness = lightness + b / 200
  }
  lightness = Math.max(0, Math.min(1, lightness))
  const satFrac = s / 100
  const ch = (1 - Math.abs(2 * lightness - 1)) * satFrac
  const hp = h / 60
  const x = ch * (1 - Math.abs(hp % 2 - 1))
  let r1 = 0, g1 = 0, b1 = 0
  if (hp < 1) { r1 = ch; g1 = x; b1 = 0 }
  else if (hp < 2) { r1 = x; g1 = ch; b1 = 0 }
  else if (hp < 3) { r1 = 0; g1 = ch; b1 = x }
  else if (hp < 4) { r1 = 0; g1 = x; b1 = ch }
  else if (hp < 5) { r1 = x; g1 = 0; b1 = ch }
  else { r1 = ch; g1 = 0; b1 = x }
  const m = lightness - ch / 2
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round((v + m) * 255)))
  return `#${clamp(r1).toString(16).padStart(2, '0')}${clamp(g1).toString(16).padStart(2, '0')}${clamp(b1).toString(16).padStart(2, '0')}`
}
