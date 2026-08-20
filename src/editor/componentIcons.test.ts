import { describe, expect, it } from 'vitest'
import { allComponents } from '@/library/registry'
import { GLYPH_SIZE, glyphFor } from './componentIcons'

describe('component glyphs', () => {
  const drawable = allComponents().filter(
    (d) => d.category !== 'io' && d.id !== 'unknown.component',
  )

  it('gives every component its own glyph rather than a category one', () => {
    const generic = drawable.filter((def) => {
      const own = glyphFor(def.id, def.category)
      const fallback = glyphFor('nothing-with-this-id', def.category)
      return own === fallback
    })
    expect(generic.map((d) => d.id)).toEqual([])
  })

  it('falls back to the category for a component it has never seen', () => {
    expect(glyphFor('from.the.future', 'logic').stroke?.length).toBeGreaterThan(0)
  })

  it('draws inside the grid it declares', () => {
    for (const def of allComponents()) {
      const glyph = glyphFor(def.id, def.category)
      for (const path of [...(glyph.stroke ?? []), ...(glyph.fill ?? [])]) {
        for (const value of path.match(/-?\d+(\.\d+)?/g) ?? []) {
          expect(Math.abs(Number(value)), `${def.id}: ${path}`).toBeLessThanOrEqual(GLYPH_SIZE + 1)
        }
      }
    }
  })

  it('distinguishes the gates from each other', () => {
    const gates = ['logic.and', 'logic.or', 'logic.not', 'logic.xor', 'logic.nand', 'logic.nor']
    const drawings = gates.map((id) => JSON.stringify(glyphFor(id, 'logic')))
    expect(new Set(drawings).size).toBe(gates.length)
  })
})
