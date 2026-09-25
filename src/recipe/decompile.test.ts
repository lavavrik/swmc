import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseMicrocontroller, serializeMicrocontroller } from '@/io/microcontroller'
import { expect as unwrap } from '@/model/result'
import type { Microcontroller } from '@/model/types'
import { buildRecipe } from './build'
import { decompile, recipeYaml } from './decompile'
import { parseRecipeText } from './parse'
import { runSim } from './run'

const fromFile = (name: string) =>
  unwrap(
    buildRecipe(
      unwrap(parseRecipeText(readFileSync(join(process.cwd(), 'recipes', name), 'utf8'), 'yaml')),
    ),
  ).doc

/** What the game would see: types, properties and wiring, ignoring node ids. */
function shape(doc: Microcontroller) {
  const index = new Map(doc.nodes.map((n, i) => [n.id, i]))
  return {
    meta: { ...doc.meta, extra: undefined },
    nodes: doc.nodes.map((n) => ({ type: n.type, properties: n.properties })),
    wires: doc.wires
      .map((w) => `${index.get(w.from.node)}.${w.from.index}>${index.get(w.to.node)}.${w.to.index}`)
      .sort(),
  }
}

describe('decompile', () => {
  it.each(['throttle-limiter.yaml', 'hybrid-car.yaml', 'hybrid-full.yaml', 'diesel.yaml'])(
    '%s survives XML → recipe → XML',
    (name) => {
      const original = unwrap(parseMicrocontroller(serializeMicrocontroller(fromFile(name))))
      const yaml = recipeYaml(unwrap(decompile(original)))
      const rebuilt = unwrap(buildRecipe(unwrap(parseRecipeText(yaml, 'yaml'))))
      const again = unwrap(parseMicrocontroller(serializeMicrocontroller(rebuilt.doc)))
      expect(shape(again)).toEqual(shape(original))
      expect(again.nodes.filter((n) => !n.type.startsWith('io.')).map((n) => n.position)).toEqual(
        original.nodes.filter((n) => !n.type.startsWith('io.')).map((n) => n.position),
      )
    },
  )

  it('names pins after their labels and writes one wire per line', () => {
    const doc = fromFile('throttle-limiter.yaml')
    const yaml = recipeYaml(unwrap(decompile(doc)))
    expect(yaml).toContain('id: throttle_in')
    expect(yaml).toContain('- { from: throttle_in, to: clamp_1 }')
    expect(yaml).toContain('max: 0.75')
    const rebuilt = unwrap(buildRecipe(unwrap(parseRecipeText(yaml, 'yaml'))))
    const sim = unwrap(runSim(rebuilt.doc, 1, { throttle_in: '1' }, rebuilt.ids))
    expect(sim.pins.find((p) => p.id === 'throttle_out')?.value).toBe(1.5)
  })
})
