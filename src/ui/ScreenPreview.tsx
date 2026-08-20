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
  /**
   * Makes the monitor a touchscreen: the position is in monitor pixels, as the
   * game reports it, and null means nothing is touching it.
   */
  onTouch?: ((touch: { x: number; y: number; pressed: boolean } | null) => void) | undefined
}

export function ScreenPreview({ frame, width, height, scale, onTouch }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  /** Pointer position in monitor pixels, which is what a script reads. */
  const locate = (event: React.PointerEvent) => {
    const box = canvasRef.current?.getBoundingClientRect()
    if (!box) return { x: 0, y: 0 }
    return {
      x: Math.floor(((event.clientX - box.left) / box.width) * width),
      y: Math.floor(((event.clientY - box.top) / box.height) * height),
    }
  }
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
      className={`screen-preview${onTouch ? ' touchable' : ''}`}
      width={width}
      height={height}
      style={{ width: width * scale, height: height * scale }}
      onPointerDown={(e) => {
        if (!onTouch) return
        // Capturing keeps a drag on the screen if it strays off the canvas;
        // a pointer that is no longer down cannot be captured, which is fine
        try {
          e.currentTarget.setPointerCapture(e.pointerId)
        } catch {
          /* nothing to capture */
        }
        onTouch({ ...locate(e), pressed: true })
      }}
      onPointerMove={(e) => {
        if (!onTouch) return
        // A script sees where the pointer is even before it presses
        onTouch({ ...locate(e), pressed: e.buttons > 0 })
      }}
      onPointerUp={(e) => onTouch?.({ ...locate(e), pressed: false })}
      onPointerLeave={() => onTouch?.(null)}
    />
  )
}
