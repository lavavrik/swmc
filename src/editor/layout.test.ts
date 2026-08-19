import { describe, expect, it } from 'vitest'
import { getComponent } from '@/library/registry'
import { GRID_PX, nodeBounds, nodeSize, portPosition } from './layout'
import type { ComponentDef } from '@/library/types'

const def = (id: string): ComponentDef => {
  const d = getComponent(id)
  if (!d) throw new Error(id)
  return d
}

describe('node layout', () => {
  it('sizes nodes in whole grid units', () => {
    const size = nodeSize(def('arithmetic.add'))
    expect(size.width % GRID_PX).toBe(0)
    expect(size.height % GRID_PX).toBe(0)
  })

  it('grows taller when a component has more ports', () => {
    const small = nodeSize(def('logic.not'))
    const big = nodeSize(def('data.function'))
    expect(big.height).toBeGreaterThan(small.height)
  })

  it('puts inputs on the left edge and outputs on the right edge', () => {
    const d = def('arithmetic.add')
    const { width } = nodeSize(d)
    expect(portPosition(d, 'in', 0).x).toBe(0)
    expect(portPosition(d, 'out', 0).x).toBe(width)
  })

  it('stacks ports downwards inside the node', () => {
    const d = def('arithmetic.add')
    const { height } = nodeSize(d)
    const first = portPosition(d, 'in', 0)
    const second = portPosition(d, 'in', 1)
    expect(second.y).toBeGreaterThan(first.y)
    expect(second.y).toBeLessThanOrEqual(height)
  })

  it('reports world-space bounds from a grid position', () => {
    const d = def('logic.not')
    const bounds = nodeBounds({ x: 2, y: 3 }, d)
    expect(bounds.minX).toBe(2 * GRID_PX)
    expect(bounds.maxY).toBe(3 * GRID_PX + nodeSize(d).height)
  })
})
