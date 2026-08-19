import { describe, expect, it, vi } from 'vitest'
import { MONITORS, renderScreen, wrapText, type DrawCommand } from './screen'

/** A canvas context that records what it was asked to draw. */
function fakeContext() {
  const calls: string[] = []
  const record =
    (name: string) =>
    (...args: unknown[]) => {
      calls.push(`${name}(${args.join(',')})`)
    }
  const ctx = {
    calls,
    imageSmoothingEnabled: true,
    lineWidth: 0,
    fillStyle: '',
    strokeStyle: '',
    font: '',
    textBaseline: '',
    clearRect: record('clearRect'),
    fillRect: vi.fn((...a: unknown[]) => calls.push(`fillRect(${a.join(',')})`)),
    beginPath: record('beginPath'),
    moveTo: record('moveTo'),
    lineTo: record('lineTo'),
    closePath: record('closePath'),
    rect: record('rect'),
    arc: record('arc'),
    fill: record('fill'),
    stroke: record('stroke'),
    fillText: record('fillText'),
  }
  return ctx as unknown as CanvasRenderingContext2D & { calls: string[] }
}

const render = (commands: DrawCommand[]) => {
  const ctx = fakeContext()
  renderScreen(ctx, commands, { width: 32, height: 32 })
  return ctx.calls
}

describe('renderScreen', () => {
  it('starts from a black screen', () => {
    expect(render([])).toContain('fillRect(0,0,32,32)')
  })

  it('fills a rectangle at whole pixels', () => {
    const calls = render([{ op: 'rectF', x: 2.4, y: 3.6, w: 5, h: 6 }])
    expect(calls).toContain('fillRect(2,3,5,6)')
  })

  it('strokes an outlined rectangle inside its bounds', () => {
    expect(render([{ op: 'rect', x: 1, y: 1, w: 4, h: 4 }])).toContain('rect(1.5,1.5,3,3)')
  })

  it('draws lines, circles and triangles', () => {
    const calls = render([
      { op: 'line', x1: 0, y1: 0, x2: 5, y2: 5 },
      { op: 'circleF', x: 4, y: 4, r: 2 },
      { op: 'triangle', x1: 0, y1: 0, x2: 1, y2: 0, x3: 0, y3: 1 },
    ])
    expect(calls).toContain('lineTo(5.5,5.5)')
    expect(calls.some((c) => c.startsWith('arc(4.5,4.5,2'))).toBe(true)
    expect(calls).toContain('closePath()')
  })

  it('draws text', () => {
    expect(render([{ op: 'text', x: 1, y: 2, text: 'hi' }])).toContain('fillText(hi,1,2)')
  })

  it('clears with the current colour', () => {
    const calls = render([{ op: 'color', r: 255, g: 0, b: 0, a: 255 }, { op: 'clear' }])
    // the initial black fill, then the cleared colour
    expect(calls.filter((c) => c === 'fillRect(0,0,32,32)')).toHaveLength(2)
  })
})

describe('wrapText', () => {
  it('wraps on words', () => {
    expect(wrapText('the quick brown fox', 9)).toEqual(['the quick', 'brown fox'])
  })

  it('keeps explicit line breaks', () => {
    expect(wrapText('a\nb', 10)).toEqual(['a', 'b'])
  })

  it('lets a word longer than the line stand alone', () => {
    expect(wrapText('extraordinary', 5)).toEqual(['extraordinary'])
  })
})

describe('monitors', () => {
  it('lists the sizes the game offers, in pixels', () => {
    expect(MONITORS[0]).toEqual({ label: '1×1', width: 32, height: 32 })
    expect(MONITORS.at(-1)?.width).toBe(288)
  })
})
