/**
 * Simulation state for the UI.
 *
 * The engine itself lives outside React as a single instance; this store holds
 * only what the interface needs to draw — whether it is running, the tick
 * count, and the values on wires and pins. Display updates are throttled below
 * the tick rate so a 60 Hz simulation does not mean 60 React renders a second.
 */
import { create } from 'zustand'
import type { SignalValue } from '@/library/types'
import { createEmpty } from '@/model/ops'
import type { Microcontroller, NodeId, WireId } from '@/model/types'
import { Simulation, TICKS_PER_SECOND } from './engine'

/** How often the displayed values refresh, in ticks. */
export const DISPLAY_INTERVAL = 3
export { TICKS_PER_SECOND }

export const simulation = new Simulation(createEmpty())

/** The microcontroller's pins, remembered so the panel can list them. */
export interface PinSummary {
  readonly id: NodeId
  readonly direction: 'in' | 'out'
  readonly signal: string
  readonly label: string
  readonly description: string
}

function pinsOf(doc: Microcontroller): PinSummary[] {
  return doc.ioOrder.flatMap((id) => {
    const node = doc.nodes.find((n) => n.id === id)
    if (!node) return []
    const [, direction, signal] = node.type.split('.') as ['io', 'in' | 'out', string]
    const label = typeof node.properties.label === 'string' ? node.properties.label : ''
    const description =
      typeof node.properties.description === 'string' ? node.properties.description : ''
    return [
      {
        id,
        direction,
        signal,
        label: label || `${direction === 'in' ? 'input' : 'output'}`,
        description,
      },
    ]
  })
}

export interface SimulationState {
  running: boolean
  tick: number
  /** What each wire carried at the last display refresh. */
  values: ReadonlyMap<WireId, SignalValue | undefined>
  outputs: ReadonlyMap<NodeId, SignalValue | undefined>
  /** Values the user has set on the microcontroller's input pins. */
  inputs: Readonly<Record<NodeId, SignalValue>>
  pins: readonly PinSummary[]

  play(): void
  pause(): void
  toggle(): void
  /** Advances one tick and refreshes the display. */
  stepOnce(): void
  /** Advances one tick without touching React state; used by the frame loop. */
  advance(): void
  reset(): void
  setInput(node: NodeId, value: SignalValue): void
  /** Points the engine at an edited document. */
  useDocument(doc: Microcontroller): void
  /** Copies the engine's current values into the store. */
  refresh(): void
}

export const useSimulationStore = create<SimulationState>((set, get) => ({
  running: false,
  tick: 0,
  values: new Map(),
  outputs: new Map(),
  inputs: {},
  pins: [],

  play: () => set({ running: true }),
  pause: () => set({ running: false }),
  toggle: () => set({ running: !get().running }),

  advance() {
    simulation.step()
  },

  stepOnce() {
    simulation.step()
    get().refresh()
  },

  reset() {
    simulation.reset()
    set({ tick: 0, values: new Map(), outputs: new Map() })
  },

  setInput(node, value) {
    simulation.setInput(node, value)
    set({ inputs: { ...get().inputs, [node]: value } })
  },

  useDocument(doc) {
    simulation.setDocument(doc)
    // Pin values belong to the session rather than to the graph, so re-apply them
    for (const [node, value] of Object.entries(get().inputs)) simulation.setInput(node, value)
    set({ pins: pinsOf(doc) })
  },

  refresh() {
    const outputs = new Map<NodeId, SignalValue | undefined>()
    for (const pin of get().pins) {
      if (pin.direction === 'out') outputs.set(pin.id, simulation.getOutput(pin.id))
    }
    set({ tick: simulation.tickCount, values: simulation.wireValues(), outputs })
  },
}))
