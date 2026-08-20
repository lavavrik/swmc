import { describe, expect, it } from 'vitest'
import { getComponent } from '@/library/registry'
import {
  CARD,
  GAME_UNIT,
  GRID_PX,
  cardHeightUnits,
  cardLayout,
  defaultLayout,
  nodeBounds,
  portPosition,
} from './layout'
import type { ComponentDef } from '@/library/types'

const def = (id: string): ComponentDef => {
  const d = getComponent(id)
  if (!d) throw new Error(id)
  return d
}

/** Height in game units, which is how the game records it. */
const heightUnits = (id: string) => defaultLayout(def(id)).height / GAME_UNIT

describe('card layout', () => {
  it('makes every component one game unit wide, as the game does', () => {
    expect(defaultLayout(def('arithmetic.add')).width).toBe(GAME_UNIT)
    expect(defaultLayout(def('data.luaScript')).width).toBe(GAME_UNIT)
  })

  it('reproduces the heights the game gives its components', () => {
    // A quarter unit per port row plus a quarter unit of card
    expect(heightUnits('logic.not')).toBe(0.5)
    expect(heightUnits('arithmetic.add')).toBe(0.75)
    expect(heightUnits('arithmetic.function3')).toBe(1)
    expect(heightUnits('arithmetic.numericalJunction')).toBe(0.75)
    expect(heightUnits('tooltip.number')).toBe(0.75)
  })

  it('grows a composite write by a quarter unit per channel', () => {
    const write = def('composite.writeNumber')
    const oneChannel = cardLayout(write, { channel: 1, count: 1 }).height / GAME_UNIT
    const fourChannels = cardLayout(write, { channel: 1, count: 4 }).height / GAME_UNIT
    expect(fourChannels - oneChannel).toBe(0.75)
    expect(fourChannels).toBe(cardHeightUnits(5))
  })

  it('puts inputs on the left edge and outputs on the right edge', () => {
    const layout = defaultLayout(def('arithmetic.add'))
    expect(portPosition(layout, 'in', 0).x).toBe(0)
    expect(portPosition(layout, 'out', 0).x).toBe(layout.width)
  })

  it('spaces ports a quarter unit apart, inside the card', () => {
    const layout = defaultLayout(def('arithmetic.add'))
    expect(portPosition(layout, 'in', 1).y - portPosition(layout, 'in', 0).y).toBe(CARD.portSpacing)
    expect(portPosition(layout, 'in', 1).y).toBeLessThan(layout.height)
  })

  it('reports world-space bounds from a grid position', () => {
    const layout = defaultLayout(def('logic.not'))
    const bounds = nodeBounds({ x: 2, y: 3 }, layout)
    expect(bounds.minX).toBe(2 * GRID_PX)
    expect(bounds.maxY).toBe(3 * GRID_PX + layout.height)
  })
})
