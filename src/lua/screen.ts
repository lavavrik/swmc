/**
 * Turning the display list a script drew into monitor pixels.
 *
 * The work happens in `Raster`, which paints whole pixels with no smoothing —
 * a monitor in the game is 32 pixels across and looks it. This file only maps
 * the commands onto it and hands the result to a canvas.
 */
import type { DrawCommand, Rgba } from '@/library/video'
import { Raster } from './raster'

export type { DrawCommand, Rgba } from '@/library/video'
export { MONITORS } from '@/library/video'
export { TEXT_ADVANCE, TEXT_LINE_HEIGHT, wrapText } from './raster'

const WHITE: Rgba = { r: 255, g: 255, b: 255, a: 255 }
const BLACK: Rgba = { r: 0, g: 0, b: 0, a: 255 }
/** The map is not modelled; this stands in for where it would be drawn. */
const MAP_STAND_IN: Rgba = { r: 40, g: 90, b: 120, a: 160 }

export interface ScreenSize {
  readonly width: number
  readonly height: number
}

/** Replays a display list onto a fresh raster. */
export function rasterise(commands: readonly DrawCommand[], size: ScreenSize): Raster {
  const raster = new Raster(size.width, size.height)
  raster.clear(BLACK)

  let colour: Rgba = WHITE
  for (const command of commands) {
    switch (command.op) {
      case 'color':
        colour = command
        break
      case 'clear':
        raster.clear(colour)
        break
      case 'line':
        raster.line(command.x1, command.y1, command.x2, command.y2, colour)
        break
      case 'circle':
        raster.circle(command.x, command.y, command.r, colour)
        break
      case 'circleF':
        raster.fillCircle(command.x, command.y, command.r, colour)
        break
      case 'rect':
        raster.strokeRect(command.x, command.y, command.w, command.h, colour)
        break
      case 'rectF':
        raster.fillRect(command.x, command.y, command.w, command.h, colour)
        break
      case 'triangle':
        raster.triangle(
          command.x1,
          command.y1,
          command.x2,
          command.y2,
          command.x3,
          command.y3,
          colour,
        )
        break
      case 'triangleF':
        raster.fillTriangle(
          command.x1,
          command.y1,
          command.x2,
          command.y2,
          command.x3,
          command.y3,
          colour,
        )
        break
      case 'text':
        raster.text(command.x, command.y, command.text, colour)
        break
      case 'textBox':
        raster.textBox(
          command.x,
          command.y,
          command.w,
          command.h,
          command.text,
          command.ha,
          command.va,
          colour,
        )
        break
      case 'map':
        raster.clear(MAP_STAND_IN)
        break
      case 'mapColor':
        break
    }
  }

  return raster
}

/**
 * Draws a display list onto a canvas at one canvas pixel per monitor pixel. The
 * caller scales the canvas up in CSS, which keeps the pixels square and hard.
 */
export function renderScreen(
  ctx: CanvasRenderingContext2D,
  commands: readonly DrawCommand[],
  size: ScreenSize,
): void {
  const raster = rasterise(commands, size)
  const image = ctx.createImageData(raster.width, raster.height)
  image.data.set(raster.data)
  ctx.putImageData(image, 0, 0)
}
