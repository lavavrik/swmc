import { describe, expect, it } from 'vitest'
import { allComponents, getComponent, librarySchema } from './registry'
import { defaultProperties } from './defaults'
import { defaultPorts } from './ports'

describe('registry integrity', () => {
  const defs = allComponents()

  it('registers components', () => {
    expect(defs.length).toBeGreaterThan(0)
  })

  it('has unique ids', () => {
    const ids = defs.map((d) => d.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('has unique Stormworks type numbers where they are known', () => {
    const types = defs.map((d) => d.swType).filter((t): t is number => t !== null)
    expect(new Set(types).size).toBe(types.length)
  })

  it('gives every component a name, description and category', () => {
    for (const d of defs) {
      expect(d.name.length, d.id).toBeGreaterThan(0)
      expect(d.description.length, d.id).toBeGreaterThan(0)
      expect(d.category.length, d.id).toBeGreaterThan(0)
    }
  })

  it('labels every port', () => {
    for (const d of defs) {
      for (const p of [...defaultPorts(d, 'in'), ...defaultPorts(d, 'out')])
        expect(p.label.length, d.id).toBeGreaterThan(0)
    }
  })

  it('produces one output value per output port', () => {
    for (const d of defs) {
      const { outputs } = d.eval({
        inputs: defaultPorts(d, 'in').map(() => undefined),
        properties: defaultProperties(d),
        state: undefined,
      })
      expect(outputs.length, d.id).toBe(defaultPorts(d, 'out').length)
    }
  })
})

describe('librarySchema', () => {
  it('answers port questions for the model layer', () => {
    expect(librarySchema.has('arithmetic.add')).toBe(true)
    expect(librarySchema.has('nope')).toBe(false)
    expect(librarySchema.portCount('arithmetic.add', {}, 'in')).toBe(2)
    expect(librarySchema.portSignal('arithmetic.add', {}, 'out', 0)).toBe('number')
    expect(librarySchema.portSignal('arithmetic.add', {}, 'out', 1)).toBeUndefined()
  })
})

describe('getComponent', () => {
  it('returns undefined for an unknown id', () => {
    expect(getComponent('nope')).toBeUndefined()
  })
})
