/**
 * The tick engine.
 *
 * A plain class over the model with no knowledge of React: `step()` advances
 * the graph by one tick, and the editor reads `wireValues()` to draw what is
 * flowing. Tests drive it directly, which is how component semantics get
 * pinned down.
 */
import { getComponent } from '@/library/registry'
import { resolvePorts } from '@/library/ports'
import type { SignalValue } from '@/library/types'
import type { Microcontroller, NodeId, PortId, WireId } from '@/model/types'
import { planEvaluation, type EvaluationPlan } from './plan'

/** The game runs microcontroller logic at 60 ticks per second. */
export const TICKS_PER_SECOND = 60

const portKey = (node: NodeId, index: number) => `${node}#${index}`

const isInputPin = (type: string) => type.startsWith('io.in.')
const isOutputPin = (type: string) => type.startsWith('io.out.')

export class Simulation {
  private doc: Microcontroller
  private plan: EvaluationPlan
  /** Output values produced this tick, and the tick before, keyed by port. */
  private current = new Map<string, SignalValue | undefined>()
  private previous = new Map<string, SignalValue | undefined>()
  private state = new Map<NodeId, unknown>()
  /** Values the user has set on the microcontroller's input pins. */
  private external = new Map<NodeId, SignalValue>()
  private pinOutputs = new Map<NodeId, SignalValue | undefined>()
  private ticks = 0

  constructor(doc: Microcontroller) {
    this.doc = doc
    this.plan = planEvaluation(doc)
  }

  /**
   * Points the engine at an edited document, keeping the state of every
   * component that is still there so editing does not restart the simulation.
   */
  setDocument(doc: Microcontroller): void {
    this.doc = doc
    this.plan = planEvaluation(doc)
    const living = new Set(doc.nodes.map((n) => n.id))
    for (const id of [...this.state.keys()]) if (!living.has(id)) this.state.delete(id)
  }

  get tickCount(): number {
    return this.ticks
  }

  reset(): void {
    this.current.clear()
    this.previous.clear()
    this.state.clear()
    this.pinOutputs.clear()
    this.ticks = 0
  }

  /** Sets the value arriving on one of the microcontroller's input pins. */
  setInput(node: NodeId, value: SignalValue): void {
    this.external.set(node, value)
  }

  /** The value leaving one of the microcontroller's output pins. */
  getOutput(node: NodeId): SignalValue | undefined {
    return this.pinOutputs.get(node)
  }

  /** Value on a component's output port, as of the last completed tick. */
  outputValue(port: PortId): SignalValue | undefined {
    return this.current.get(portKey(port.node, port.index))
  }

  /** What every wire is carrying, for the editor to display. */
  wireValues(): Map<WireId, SignalValue | undefined> {
    const values = new Map<WireId, SignalValue | undefined>()
    for (const wire of this.doc.wires) {
      const source = this.plan.backEdges.has(wire.id) ? this.previous : this.current
      values.set(wire.id, source.get(portKey(wire.from.node, wire.from.index)))
    }
    return values
  }

  /** Advances the whole graph by one tick. */
  step(): void {
    this.previous = this.current
    this.current = new Map()

    const nodes = new Map(this.doc.nodes.map((n) => [n.id, n]))
    for (const id of this.plan.order) {
      const node = nodes.get(id)
      const def = node && getComponent(node.type)
      if (!node || !def) continue

      const inputs = resolvePorts(def, 'in', node.properties).map((_, index) =>
        this.valueInto({ node: id, kind: 'in', index }),
      )

      if (isInputPin(node.type)) {
        // Input pins are driven from outside the graph
        this.current.set(portKey(id, 0), this.external.get(id))
        continue
      }
      if (isOutputPin(node.type)) {
        this.pinOutputs.set(id, inputs[0])
        continue
      }

      const result = def.eval({ inputs, properties: node.properties, state: this.state.get(id) })
      if (def.stateful === true) this.state.set(id, result.state)
      result.outputs.forEach((value, index) => this.current.set(portKey(id, index), value))
    }

    this.ticks++
  }

  /** Advances several ticks at once. */
  run(ticks: number): void {
    for (let i = 0; i < ticks; i++) this.step()
  }

  /** The value arriving at an input port, respecting one-tick feedback delay. */
  private valueInto(port: PortId): SignalValue | undefined {
    const wire = this.doc.wires.find(
      (w) => w.to.node === port.node && w.to.kind === 'in' && w.to.index === port.index,
    )
    if (!wire) return undefined
    const source = this.plan.backEdges.has(wire.id) ? this.previous : this.current
    return source.get(portKey(wire.from.node, wire.from.index))
  }
}
