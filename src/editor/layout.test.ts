import { describe, expect, it } from 'vitest'
import { getComponent } from '@/library/registry'
import { GRID_PX, cardLayout, defaultLayout, nodeBounds, portPosition } from './layout'
import type { ComponentDef } from '@/library/types'

const def = (id: string): ComponentDef => {
  const d = getComponent(id)
  if (!d) throw new Error(id)
  return d
}

describe('card layout', () => {
  it('sizes cards in whole grid units', () => {
    const layout = defaultLayout(def('arithmetic.add'))
    expect(layout.width % GRID_PX).toBe(0)
    expect(layout.height % GRID_PX).toBe(0)
  })

  it('grows taller when a component has more ports', () => {
    expect(defaultLayout(def('arithmetic.function3')).height).toBeGreaterThan(
      defaultLayout(def('logic.not')).height,
    )
  })

  it('puts inputs on the left edge and outputs on the right edge', () => {
    const layout = defaultLayout(def('arithmetic.add'))
    expect(portPosition(layout, 'in', 0).x).toBe(0)
    expect(portPosition(layout, 'out', 0).x).toBe(layout.width)
  })

  it('stacks ports downwards inside the card', () => {
    const layout = defaultLayout(def('arithmetic.add'))
    const first = portPosition(layout, 'in', 0)
    const second = portPosition(layout, 'in', 1)
    expect(second.y).toBeGreaterThan(first.y)
    expect(second.y).toBeLessThanOrEqual(layout.height)
  })

  it('reports world-space bounds from a grid position', () => {
    const layout = defaultLayout(def('logic.not'))
    const bounds = nodeBounds({ x: 2, y: 3 }, layout)
    expect(bounds.minX).toBe(2 * GRID_PX)
    expect(bounds.maxY).toBe(3 * GRID_PX + layout.height)
  })

  it('resizes a card whose ports depend on its properties', () => {
    const write = def('composite.writeNumber')
    const small = cardLayout(write, { channel: 1, count: 1 })
    const large = cardLayout(write, { channel: 1, count: 8 })
    expect(large.inputs.length).toBeGreaterThan(small.inputs.length)
    expect(large.height).toBeGreaterThan(small.height)
  })
})
