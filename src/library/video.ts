/**
 * What a video signal carries.
 *
 * A frame is the display list a script drew, not a raster: it is produced by
 * `screen.*` calls, routed through switchboxes and output pins unchanged, and
 * rasterised only where it is finally looked at. That keeps routing cheap and
 * lets any monitor draw the same frame at its own size.
 */

export interface Rgba {
  readonly r: number
  readonly g: number
  readonly b: number
  readonly a: number
}

export type DrawCommand =
  | ({ op: 'color' } & Rgba)
  | { op: 'clear' }
  | { op: 'line'; x1: number; y1: number; x2: number; y2: number }
  | { op: 'circle' | 'circleF'; x: number; y: number; r: number }
  | { op: 'rect' | 'rectF'; x: number; y: number; w: number; h: number }
  | {
      op: 'triangle' | 'triangleF'
      x1: number
      y1: number
      x2: number
      y2: number
      x3: number
      y3: number
    }
  | { op: 'text'; x: number; y: number; text: string }
  | {
      op: 'textBox'
      x: number
      y: number
      w: number
      h: number
      text: string
      ha: number
      va: number
    }
  | { op: 'map'; x: number; y: number; zoom: number }
  | ({ op: 'mapColor'; which: string } & Rgba)

export interface VideoFrame {
  readonly kind: 'video'
  readonly commands: readonly DrawCommand[]
  /** The size the frame was drawn for, in pixels. */
  readonly width: number
  readonly height: number
}

export const BLANK_FRAME: VideoFrame = { kind: 'video', commands: [], width: 32, height: 32 }

/** Monitor sizes the game offers, in blocks and in pixels. */
export const MONITORS = [
  { label: '1×1', width: 32, height: 32 },
  { label: '2×1', width: 64, height: 32 },
  { label: '2×2', width: 64, height: 64 },
  { label: '3×2', width: 96, height: 64 },
  { label: '3×3', width: 96, height: 96 },
  { label: '5×3', width: 160, height: 96 },
  { label: '9×5', width: 288, height: 160 },
] as const

export type MonitorSize = (typeof MONITORS)[number]
