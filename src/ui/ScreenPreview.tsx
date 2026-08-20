/**
 * A monitor: whatever video frame it is pointed at, rasterised.
 *
 * The frame is fetched on every animation frame rather than through React —
 * it changes 60 times a second and nothing else in the interface needs to know
 * when it does.
 */
import { useEffect, useRef } from 'react'
import type { VideoFrame } from '@/library/video'
import { renderScreen } from '@/lua/screen'

interface Props {
  /** Called each frame; returning null leaves the screen blank. */
  frame: () => VideoFrame | null
  width: number
  height: number
  /** How many screen pixels one monitor pixel occupies. */
  scale: number
}

export function ScreenPreview({ frame, width, height, scale }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const frameRef = useRef(frame)
  frameRef.current = frame

  useEffect(() => {
    let request = 0
    const draw = () => {
      request = requestAnimationFrame(draw)
      const ctx = canvasRef.current?.getContext('2d')
      if (ctx) renderScreen(ctx, frameRef.current()?.commands ?? [], { width, height })
    }
    request = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(request)
  }, [width, height])

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
