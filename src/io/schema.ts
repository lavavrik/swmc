/**
 * Everything this editor knows about the Stormworks microprocessor file format.
 *
 * Derived from the community library `sw_mc_lib` and the game wiki rather than
 * from sample files, so anything uncertain is stated here as an assumption and
 * confined to this module. Correcting it against a real save is a change here
 * and in the affected component's `xml` mapping — nowhere else.
 *
 * Shape of a file:
 *
 * ```xml
 * <microprocessor name="…" description="…" width="1" length="1"
 *                 id_counter="7" id_counter_node="2" sym0="…">
 *   <nodes>
 *     <n id="1" component_id="2">
 *       <node label="Throttle" mode="1" type="1" description="…">
 *         <position x="0" z="0"/>
 *       </node>
 *     </n>
 *   </nodes>
 *   <group>
 *     <data><inputs/><outputs/></data>
 *     <components>
 *       <c type="6">
 *         <object id="3">
 *           <pos x="1" y="-2"/>
 *           <in1 component_id="2" node_index="0"/>
 *           <n text="4" value="4"/>
 *         </object>
 *       </c>
 *     </components>
 *     <components_bridge>
 *       <c type="2"><object id="2"><pos x="0" y="0"/></object></c>
 *     </components_bridge>
 *     <groups/>
 *   </group>
 * </microprocessor>
 * ```
 *
 * A wire is stored on its destination: `<inN component_id="…" node_index="…"/>`
 * names the source component and which of its outputs the wire leaves from.
 */
import type { SignalType } from '@/model/types'

export const ROOT_TAGS = ['microprocessor', 'microprocessor_definition'] as const

/** Signal type codes as they appear on a `<node>` element. */
export const SIGNAL_CODES: Record<SignalType, number> = {
  onoff: 0,
  number: 1,
  composite: 5,
  video: 6,
  audio: 7,
}

export const SIGNAL_BY_CODE = new Map<number, SignalType>(
  Object.entries(SIGNAL_CODES).map(([signal, code]) => [code, signal as SignalType]),
)

/** `mode` on a `<node>`: 0 is a pin the microcontroller drives, 1 is one it reads. */
export const NODE_MODE = { output: 0, input: 1 } as const

/**
 * The `type` on a bridge component, which is the microcontroller-facing side of
 * a pin. It encodes the pin's direction and signal together.
 */
export const BRIDGE_TYPES: { direction: 'in' | 'out'; signal: SignalType; type: number }[] = [
  { direction: 'in', signal: 'onoff', type: 0 },
  { direction: 'out', signal: 'onoff', type: 1 },
  { direction: 'in', signal: 'number', type: 2 },
  { direction: 'out', signal: 'number', type: 3 },
  { direction: 'in', signal: 'composite', type: 4 },
  { direction: 'out', signal: 'composite', type: 5 },
  { direction: 'in', signal: 'video', type: 6 },
  { direction: 'out', signal: 'video', type: 7 },
  { direction: 'in', signal: 'audio', type: 8 },
  { direction: 'out', signal: 'audio', type: 9 },
]

export function bridgeType(direction: 'in' | 'out', signal: SignalType): number {
  return BRIDGE_TYPES.find((b) => b.direction === direction && b.signal === signal)?.type ?? 0
}

/**
 * The game positions components in 0.25 steps, so one game unit is four grid
 * units here.
 *
 * It also measures y upwards from a component's **bottom** edge, while this
 * editor measures downwards from the top — so converting a position needs the
 * component's height, and a stack of different-sized components only lines up
 * once that is accounted for. Confirmed against a saved microcontroller, where
 * three stacked components share their edges exactly.
 */
export const POSITION_SCALE = 4

export const gamePositionToGrid = (x: number, y: number, heightUnits: number) => ({
  x: Math.round(x * POSITION_SCALE),
  y: Math.round(-(y + heightUnits) * POSITION_SCALE),
})

export const gridPositionToGame = (x: number, y: number, heightUnits: number) => ({
  x: x / POSITION_SCALE,
  y: -y / POSITION_SCALE - heightUnits,
})

/** Microprocessor attributes this editor understands; anything else is preserved. */
export const KNOWN_ROOT_ATTRIBUTES = new Set([
  'name',
  'description',
  'width',
  'length',
  'id_counter',
  'id_counter_node',
])

/** The component type used when a file names one this editor does not know. */
export const UNKNOWN_COMPONENT = 'unknown.component'

/**
 * A channel offset of -1 means the component takes its start channel from its
 * `off` input rather than from the property, which decodes to channel 0.
 */
export const CHANNEL_FROM_INPUT = 0
