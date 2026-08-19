/**
 * The Lua script component.
 *
 * Evaluation delegates to whatever interpreter is installed through the Lua
 * hook. With none installed — before the interpreter has loaded, or in a test
 * that does not need it — the component passes its signals straight through so
 * a graph containing a script node still behaves sensibly.
 */
import { defineComponent } from '../define'
import { runLuaTick } from '../hooks'
import { composite, textProp, video } from '../portHelpers'
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
    properties: [
      {
        kind: 'text',
        key: 'script',
        label: 'Script',
        default: '-- onTick()\n',
        xml: { form: 'attribute', name: 'script' },
      },
    ],
    eval: ({ inputs, properties, nodeId }) => {
      const input = asComposite(inputs[0])
      const outcome = runLuaTick({
        nodeId,
        script: textProp(properties, 'script'),
        input,
        properties,
      })
      return { outputs: [outcome ? outcome.output : input, inputs[1]] }
    },
  }),
]
