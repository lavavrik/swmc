/**
 * The Lua script component.
 *
 * Until the Lua subsystem lands, evaluation passes its inputs straight through
 * so a graph containing a script node still behaves sensibly.
 */
import { defineComponent } from '../define'
import { composite, video } from '../portHelpers'
import { asComposite } from '../values'
import type { ComponentDef } from '../types'

/** The in-game limit on script length. */
export const SCRIPT_CHARACTER_LIMIT = 4096

export const luaComponents: ComponentDef[] = [
  defineComponent({
    id: 'data.luaScript',
    swType: 56,
    category: 'data',
    name: 'Lua Script',
    description: 'Runs a Lua script every tick, reading and writing composite channels.',
    inputs: [composite('Composite'), video('Video')],
    outputs: [composite('Composite'), video('Video')],
    properties: [{ kind: 'text', key: 'script', label: 'Script', default: '-- onTick()\n' }],
    eval: ({ inputs }) => ({ outputs: [asComposite(inputs[0]), inputs[1]] }),
  }),
]
