'use client'
import { useRef, useEffect, useCallback } from 'react'
import type { OfficeState } from './engine/officeState'
import type { SelectionRenderState, CollaborationLink } from './engine/renderer'
import { startGameLoop } from './engine/gameLoop'
import { renderFrame } from './engine/renderer'
import { TILE_SIZE } from './pixel-types'
import {
  ZOOM_MIN,
  ZOOM_MAX,
  ZOOM_SCROLL_THRESHOLD,
  PAN_MARGIN_FRACTION,
} from './pixel-constants'

interface PixelOfficeCanvasProps {
  officeState: OfficeState
  onCharacterClick: (numericId: number) => void
  onCharacterHover: (numericId: number | null, screenX: number, screenY: number) => void
  zoom: number
  onZoomChange: (zoom: number) => void
  isVisible: boolean
  collaborationLinks?: CollaborationLink[]
}

export function PixelOfficeCanvas({
  officeState,
  onCharacterClick,
  onCharacterHover,
  zoom,
  onZoomChange,
  isVisible,
  collaborationLinks,
}: PixelOfficeCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const offsetRef = useRef({ x: 0, y: 0 })
  const panRef = useRef({ x: 0, y: 0 })
  const isPanningRef = useRef(false)
  const panStartRef = useRef({ mouseX: 0, mouseY: 0, panX: 0, panY: 0 })
  const zoomAccumulatorRef = useRef(0)
  const stopLoopRef = useRef<(() => void) | null>(null)

  const dprRef = useRef(window.devicePixelRatio || 1)

  const clampPan = useCallback((px: number, py: number): { x: number; y: number } => {
    const canvas = canvasRef.current
    if (!canvas) return { x: px, y: py }
    const layout = officeState.getLayout()
    const ez = zoom * dprRef.current
    const mapW = layout.cols * TILE_SIZE * ez
    const mapH = layout.rows * TILE_SIZE * ez
    const marginX = canvas.width * PAN_MARGIN_FRACTION
    const marginY = canvas.height * PAN_MARGIN_FRACTION
    const maxPanX = (mapW / 2) + canvas.width / 2 - marginX
    const maxPanY = (mapH / 2) + canvas.height / 2 - marginY
    return {
      x: Math.max(-maxPanX, Math.min(maxPanX, px)),
      y: Math.max(-maxPanY, Math.min(maxPanY, py)),
    }
  }, [officeState, zoom])

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return
    const rect = container.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    dprRef.current = dpr
    canvas.width = Math.round(rect.width * dpr)
    canvas.height = Math.round(rect.height * dpr)
    canvas.style.width = `${rect.width}px`
    canvas.style.height = `${rect.height}px`
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !isVisible) return

    resizeCanvas()

    const observer = new ResizeObserver(() => resizeCanvas())
    if (containerRef.current) {
      observer.observe(containerRef.current)
    }

    const stop = startGameLoop(canvas, {
      update: (dt) => {
        officeState.update(dt)
      },
      render: (ctx) => {
        const w = canvas.width
        const h = canvas.height
        const ez = zoom * dprRef.current

        const selectionRender: SelectionRenderState = {
          selectedAgentId: officeState.selectedAgentId,
          hoveredAgentId: officeState.hoveredAgentId,
          hoveredTile: officeState.hoveredTile,
          seats: officeState.seats,
          characters: officeState.characters,
        }

        const { offsetX, offsetY } = renderFrame(
          ctx, w, h,
          officeState.tileMap,
          officeState.furniture,
          officeState.getCharacters(),
          ez,
          panRef.current.x,
          panRef.current.y,
          selectionRender,
          officeState.getLayout().tileColors,
          officeState.getLayout().cols,
          officeState.getLayout().rows,
          collaborationLinks,
          officeState.getLayout().roomLabels,
        )
        offsetRef.current = { x: offsetX, y: offsetY }
      },
    })

    stopLoopRef.current = stop

    return () => {
      stop()
      stopLoopRef.current = null
      observer.disconnect()
    }
  }, [officeState, resizeCanvas, zoom, isVisible])

  // Pause/resume on visibility change
  useEffect(() => {
    if (!isVisible && stopLoopRef.current) {
      stopLoopRef.current()
      stopLoopRef.current = null
    }
  }, [isVisible])

  const screenToWorld = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current
      if (!canvas) return null
      const rect = canvas.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      const cssX = clientX - rect.left
      const cssY = clientY - rect.top
      const deviceX = cssX * dpr
      const deviceY = cssY * dpr
      const ez = zoom * dpr
      const worldX = (deviceX - offsetRef.current.x) / ez
      const worldY = (deviceY - offsetRef.current.y) / ez
      return { worldX, worldY, screenX: cssX, screenY: cssY }
    },
    [zoom],
  )

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (isPanningRef.current) {
        const dpr = window.devicePixelRatio || 1
        const dx = (e.clientX - panStartRef.current.mouseX) * dpr
        const dy = (e.clientY - panStartRef.current.mouseY) * dpr
        panRef.current = clampPan(
          panStartRef.current.panX + dx,
          panStartRef.current.panY + dy,
        )
        return
      }

      const pos = screenToWorld(e.clientX, e.clientY)
      if (!pos) return
      const hitId = officeState.getCharacterAt(pos.worldX, pos.worldY)
      const canvas = canvasRef.current
      if (canvas) {
        canvas.style.cursor = hitId !== null ? 'pointer' : 'default'
      }
      officeState.hoveredAgentId = hitId

      // Get container-relative position for tooltip
      const container = containerRef.current
      if (container) {
        const containerRect = container.getBoundingClientRect()
        onCharacterHover(
          hitId,
          e.clientX - containerRect.left,
          e.clientY - containerRect.top,
        )
      }
    },
    [officeState, screenToWorld, clampPan, onCharacterHover],
  )

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button === 1) {
        e.preventDefault()
        isPanningRef.current = true
        panStartRef.current = {
          mouseX: e.clientX,
          mouseY: e.clientY,
          panX: panRef.current.x,
          panY: panRef.current.y,
        }
        const canvas = canvasRef.current
        if (canvas) canvas.style.cursor = 'grabbing'
        return
      }
    },
    [],
  )

  const handleMouseUp = useCallback(
    (e: React.MouseEvent) => {
      if (e.button === 1) {
        isPanningRef.current = false
        const canvas = canvasRef.current
        if (canvas) canvas.style.cursor = 'default'
        return
      }
    },
    [],
  )

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      const pos = screenToWorld(e.clientX, e.clientY)
      if (!pos) return

      const hitId = officeState.getCharacterAt(pos.worldX, pos.worldY)
      if (hitId !== null) {
        if (officeState.selectedAgentId === hitId) {
          officeState.selectedAgentId = null
        } else {
          officeState.selectedAgentId = hitId
        }
        onCharacterClick(hitId)
        return
      }

      officeState.selectedAgentId = null
    },
    [officeState, screenToWorld, onCharacterClick],
  )

  const handleMouseLeave = useCallback(() => {
    isPanningRef.current = false
    officeState.hoveredAgentId = null
    onCharacterHover(null, 0, 0)
  }, [officeState, onCharacterHover])

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault()
      if (e.ctrlKey || e.metaKey) {
        zoomAccumulatorRef.current += e.deltaY
        if (Math.abs(zoomAccumulatorRef.current) >= ZOOM_SCROLL_THRESHOLD) {
          const delta = zoomAccumulatorRef.current < 0 ? 1 : -1
          zoomAccumulatorRef.current = 0
          const newZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoom + delta))
          if (newZoom !== zoom) {
            onZoomChange(newZoom)
          }
        }
      } else {
        const dpr = window.devicePixelRatio || 1
        panRef.current = clampPan(
          panRef.current.x - e.deltaX * dpr,
          panRef.current.y - e.deltaY * dpr,
        )
      }
    },
    [zoom, onZoomChange, clampPan],
  )

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
  }, [])

  const handleAuxClick = useCallback((e: React.MouseEvent) => {
    if (e.button === 1) e.preventDefault()
  }, [])

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        overflow: 'hidden',
        background: '#1E1E2E',
        borderRadius: '0.75rem',
      }}
    >
      <canvas
        ref={canvasRef}
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onClick={handleClick}
        onAuxClick={handleAuxClick}
        onMouseLeave={handleMouseLeave}
        onWheel={handleWheel}
        onContextMenu={handleContextMenu}
        style={{ display: 'block' }}
      />
    </div>
  )
}
