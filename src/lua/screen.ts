/** The display list a script produces, and how it is drawn. */

export interface Rgba {
  r: number
  g: number
  b: number
  a: number
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

const css = (c: Rgba) => `rgba(${c.r}, ${c.g}, ${c.b}, ${c.a / 255})`

/** Character cell of the game's built-in font. */
export const FONT = { width: 5, height: 5, spacing: 1 } as const

/**
 * Replays a display list onto a canvas at one canvas pixel per screen pixel.
 * The caller scales the canvas up; drawing stays crisp because the context is
 * left un-smoothed.
 */
export function renderScreen(
  ctx: CanvasRenderingContext2D,
  commands: readonly DrawCommand[],
  size: { width: number; height: number },
): void {
  ctx.imageSmoothingEnabled = false
  ctx.clearRect(0, 0, size.width, size.height)
  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, size.width, size.height)

  let colour: Rgba = { r: 255, g: 255, b: 255, a: 255 }
  ctx.lineWidth = 1

  const stroke = () => {
    ctx.strokeStyle = css(colour)
    ctx.stroke()
  }
  const fill = () => {
    ctx.fillStyle = css(colour)
    ctx.fill()
  }
  // Shapes sit on half-pixel boundaries so a 1px stroke lands on one pixel row
  const half = (v: number) => Math.floor(v) + 0.5

  for (const command of commands) {
    switch (command.op) {
      case 'color':
        colour = command
        break
      case 'clear':
        ctx.fillStyle = css(colour)
        ctx.fillRect(0, 0, size.width, size.height)
        break
      case 'line':
        ctx.beginPath()
        ctx.moveTo(half(command.x1), half(command.y1))
        ctx.lineTo(half(command.x2), half(command.y2))
        stroke()
        break
      case 'circle':
      case 'circleF':
        ctx.beginPath()
        ctx.arc(half(command.x), half(command.y), Math.abs(command.r), 0, Math.PI * 2)
        if (command.op === 'circleF') fill()
        else stroke()
        break
      case 'rect':
        ctx.beginPath()
        ctx.rect(half(command.x), half(command.y), command.w - 1, command.h - 1)
        stroke()
        break
      case 'rectF':
        ctx.fillStyle = css(colour)
        ctx.fillRect(Math.floor(command.x), Math.floor(command.y), command.w, command.h)
        break
      case 'triangle':
      case 'triangleF':
        ctx.beginPath()
        ctx.moveTo(half(command.x1), half(command.y1))
        ctx.lineTo(half(command.x2), half(command.y2))
        ctx.lineTo(half(command.x3), half(command.y3))
        ctx.closePath()
        if (command.op === 'triangleF') fill()
        else stroke()
        break
      case 'text':
        drawText(ctx, colour, command.x, command.y, command.text)
        break
      case 'textBox':
        drawTextBox(ctx, colour, command)
        break
      case 'map':
        // The world map is not modelled; show where it would be drawn
        ctx.fillStyle = 'rgba(40, 90, 120, 0.6)'
        ctx.fillRect(0, 0, size.width, size.height)
        break
      case 'mapColor':
        break
    }
  }
}

function drawText(
  ctx: CanvasRenderingContext2D,
  colour: Rgba,
  x: number,
  y: number,
  text: string,
): void {
  ctx.fillStyle = css(colour)
  ctx.font = `${FONT.height + 1}px monospace`
  ctx.textBaseline = 'top'
  ctx.fillText(text, Math.floor(x), Math.floor(y))
}

/** Wraps text to the box width and aligns it, as the game's drawTextBox does. */
function drawTextBox(
  ctx: CanvasRenderingContext2D,
  colour: Rgba,
  command: Extract<DrawCommand, { op: 'textBox' }>,
): void {
  const perLine = Math.max(1, Math.floor(command.w / (FONT.width + FONT.spacing)))
  const lines = wrapText(command.text, perLine)
  const lineHeight = FONT.height + FONT.spacing
  const blockHeight = lines.length * lineHeight

  const top =
    command.va > 0
      ? command.y + command.h - blockHeight
      : command.va < 0
        ? command.y
        : command.y + (command.h - blockHeight) / 2

  lines.forEach((line, i) => {
    const lineWidth = line.length * (FONT.width + FONT.spacing)
    const left =
      command.ha > 0
        ? command.x + command.w - lineWidth
        : command.ha < 0
          ? command.x
          : command.x + (command.w - lineWidth) / 2
    drawText(ctx, colour, left, top + i * lineHeight, line)
  })
}

export function wrapText(text: string, perLine: number): string[] {
  const lines: string[] = []
  for (const paragraph of text.split('\n')) {
    let line = ''
    for (const word of paragraph.split(' ')) {
      const candidate = line === '' ? word : `${line} ${word}`
      if (candidate.length <= perLine) {
        line = candidate
      } else {
        if (line !== '') lines.push(line)
        line = word
      }
    }
    lines.push(line)
  }
  return lines
}
