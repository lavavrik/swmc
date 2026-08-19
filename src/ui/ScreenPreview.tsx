/**
 * The monitor a script draws on.
 *
 * The canvas is redrawn from the latest display list on every animation frame,
 * imperatively — the display list changes 60 times a second and has no business
 * passing through React state.
 */
import { useEffect, useRef } from 'react'
import { drawCommandsFor } from '@/lua/runner'
import { renderScreen } from '@/lua/screen'
import type { NodeId } from '@/model/types'

interface Props {
  node: NodeId
  width: number
  height: number
  /** How many screen pixels one script pixel occupies. */
  scale: number
}

export function ScreenPreview({ node, width, height, scale }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    let frame = 0
    const draw = () => {
      frame = requestAnimationFrame(draw)
      const ctx = canvasRef.current?.getContext('2d')
      if (ctx) renderScreen(ctx, drawCommandsFor(node), { width, height })
    }
    frame = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frame)
  }, [node, width, height])

  return (
    <canvas
      ref={canvasRef}
      className="screen-preview"
      width={width}
      height={height}
      style={{ width: width * scale, height: height * scale }}
    />
  )
}
