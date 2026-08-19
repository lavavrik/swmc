/**
 * The workspace.
 *
 * Owns the SVG surface, translates DOM pointer events into interaction-machine
 * events, and draws the four layers described in the design: grid, wires,
 * nodes, overlay. It holds no gesture logic of its own — that all lives in
 * `interaction/machine.ts`.
 */
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { getComponent, librarySchema } from '@/library/registry'
import { isConnectable } from '@/model/queries'
import type { Microcontroller, NodeId, Point, PortId, PortKind } from '@/model/types'
import { GRID_PX, cardLayout, portWorldPosition } from './layout'
import { NodeView } from './NodeView'
import { WireView } from './WireView'
import { useEditorStore } from './store'
import { screenToWorld, type Viewport } from './viewport'
import type { HitTarget } from './interaction/machine'
import './canvas.css'

/** Resolves the element under a pointer into something the machine understands. */
function hitTarget(element: Element | null): HitTarget {
  const port = element?.closest('[data-port-kind]')
  const node = element?.closest('[data-node-id]')
  if (port instanceof SVGElement && node instanceof SVGElement) {
    const id = node.getAttribute('data-node-id')
    const kind = port.getAttribute('data-port-kind') as PortKind | null
    const index = Number(port.getAttribute('data-port-index'))
    if (id && kind) return { kind: 'port', port: { node: id, kind, index } }
  }
  if (node instanceof SVGElement) {
    const id = node.getAttribute('data-node-id')
    if (id) return { kind: 'node', id }
  }
  return { kind: 'canvas' }
}

/** World position of a port, including any live drag offset on its node. */
function portWorld(
  doc: Microcontroller,
  port: PortId,
  offsetFor: (id: NodeId) => Point,
): Point | null {
  const node = doc.nodes.find((n) => n.id === port.node)
  const def = node && getComponent(node.type)
  if (!node || !def) return null
  const base = portWorldPosition(
    node.position,
    cardLayout(def, node.properties),
    port.kind,
    port.index,
  )
  const offset = offsetFor(node.id)
  return { x: base.x + offset.x, y: base.y + offset.y }
}

export function Canvas() {
  const svgRef = useRef<SVGSVGElement>(null)
  const spaceRef = useRef(false)

  const doc = useEditorStore((s) => s.doc)
  const selection = useEditorStore((s) => s.selection)
  const viewport = useEditorStore((s) => s.viewport)
  const interaction = useEditorStore((s) => s.interaction)
  const dispatch = useEditorStore((s) => s.dispatch)
  const zoom = useEditorStore((s) => s.zoomAt)

  /** Converts client coordinates into the svg's own screen space and to world space. */
  const locate = useCallback((clientX: number, clientY: number) => {
    const rect = svgRef.current?.getBoundingClientRect()
    const screen = { x: clientX - (rect?.left ?? 0), y: clientY - (rect?.top ?? 0) }
    const { viewport: vp } = useEditorStore.getState()
    return { screen, world: screenToWorld(vp, screen) }
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space') spaceRef.current = e.type === 'keydown'
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onKey)
    }
  }, [])

  // Moves and releases are tracked on the window so a gesture survives the
  // pointer leaving the canvas.
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const { screen, world } = locate(e.clientX, e.clientY)
      dispatch({
        type: 'pointerMove',
        screen,
        world,
        hover: hitTarget(document.elementFromPoint(e.clientX, e.clientY)),
      })
    }
    const onUp = (e: PointerEvent) => {
      dispatch({
        type: 'pointerUp',
        hover: hitTarget(document.elementFromPoint(e.clientX, e.clientY)),
      })
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [dispatch, locate])

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 && e.button !== 1) return
    e.preventDefault()
    const { screen, world } = locate(e.clientX, e.clientY)
    dispatch({
      type: 'pointerDown',
      target: hitTarget(e.target instanceof Element ? e.target : null),
      screen,
      world,
      button: e.button,
      shift: e.shiftKey,
      space: spaceRef.current,
    })
  }

  const onWheel = (e: React.WheelEvent) => {
    const { screen } = locate(e.clientX, e.clientY)
    zoom(screen, Math.exp(-e.deltaY * 0.0015))
  }

  const dragging = interaction.kind === 'draggingNodes' ? interaction : null
  const draggingIds = useMemo(() => new Set(dragging?.nodes ?? []), [dragging])
  const offsetFor = useCallback(
    (id: NodeId): Point =>
      dragging && draggingIds.has(id)
        ? { x: dragging.gridDelta.x * GRID_PX, y: dragging.gridDelta.y * GRID_PX }
        : { x: 0, y: 0 },
    [dragging, draggingIds],
  )

  const wiring = interaction.kind === 'draggingWire' ? interaction : null
  const selectionSet = useMemo(() => new Set(selection), [selection])

  return (
    <svg
      ref={svgRef}
      className="canvas"
      onPointerDown={onPointerDown}
      onWheel={onWheel}
      onContextMenu={(e) => e.preventDefault()}
    >
      <GridBackground viewport={viewport} />
      <g transform={`translate(${viewport.x} ${viewport.y}) scale(${viewport.scale})`}>
        <g className="layer-wires">
          {doc.wires.map((wire) => {
            const from = portWorld(doc, wire.from, offsetFor)
            const to = portWorld(doc, wire.to, offsetFor)
            const source = doc.nodes.find((n) => n.id === wire.from.node)
            const def = source && getComponent(source.type)
            const signal =
              source && def
                ? cardLayout(def, source.properties).outputs[wire.from.index]?.signal
                : undefined
            if (!from || !to || !signal) return null
            return <WireView key={wire.id} from={from} to={to} signal={signal} />
          })}
        </g>

        <g className="layer-nodes">
          {doc.nodes.map((node) => {
            const def = getComponent(node.type)
            if (!def) return null
            return (
              <NodeView
                key={node.id}
                node={node}
                def={def}
                selected={selectionSet.has(node.id)}
                offset={offsetFor(node.id)}
                dimPorts={wiring !== null}
                compatiblePort={
                  wiring
                    ? (kind, index) => {
                        const other: PortId = { node: node.id, kind, index }
                        const from = wiring.origin.kind === 'out' ? wiring.origin : other
                        const to = wiring.origin.kind === 'out' ? other : wiring.origin
                        if (from.kind !== 'out' || to.kind !== 'in') return false
                        return isConnectable(librarySchema, doc, from, to)
                      }
                    : undefined
                }
              />
            )
          })}
        </g>

        <g className="layer-overlay" pointerEvents="none">
          {wiring && <PendingWire doc={doc} wiring={wiring} offsetFor={offsetFor} />}
          {interaction.kind === 'marquee' && (
            <rect
              x={Math.min(interaction.startWorld.x, interaction.currentWorld.x)}
              y={Math.min(interaction.startWorld.y, interaction.currentWorld.y)}
              width={Math.abs(interaction.currentWorld.x - interaction.startWorld.x)}
              height={Math.abs(interaction.currentWorld.y - interaction.startWorld.y)}
              fill="var(--marquee-fill)"
              stroke="var(--marquee-stroke)"
              strokeWidth={1 / viewport.scale}
              strokeDasharray={`${4 / viewport.scale} ${3 / viewport.scale}`}
            />
          )}
        </g>
      </g>
    </svg>
  )
}

/** The wire that follows the cursor while a connection is being dragged. */
function PendingWire({
  doc,
  wiring,
  offsetFor,
}: {
  doc: Microcontroller
  wiring: Extract<
    ReturnType<typeof useEditorStore.getState>['interaction'],
    { kind: 'draggingWire' }
  >
  offsetFor: (id: NodeId) => Point
}) {
  const anchor = portWorld(doc, wiring.origin, offsetFor)
  if (!anchor) return null
  const node = doc.nodes.find((n) => n.id === wiring.origin.node)
  const def = node && getComponent(node.type)
  if (!node || !def) return null
  const layout = cardLayout(def, node.properties)
  const ports = wiring.origin.kind === 'out' ? layout.outputs : layout.inputs
  const signal = ports[wiring.origin.index]?.signal
  if (!signal) return null
  const [from, to] =
    wiring.origin.kind === 'out' ? [anchor, wiring.cursorWorld] : [wiring.cursorWorld, anchor]
  return <WireView from={from} to={to} signal={signal} faded />
}

/**
 * The teal grid. Drawn as a tiled pattern so panning and zooming cost nothing,
 * with a heavier line every eight cells as in the game.
 */
function GridBackground({ viewport }: { viewport: Viewport }) {
  const cell = GRID_PX * viewport.scale
  const major = cell * 8
  return (
    <>
      <defs>
        <pattern
          id="grid-minor"
          width={cell}
          height={cell}
          patternUnits="userSpaceOnUse"
          patternTransform={`translate(${viewport.x} ${viewport.y})`}
        >
          <path
            d={`M ${cell} 0 L 0 0 0 ${cell}`}
            fill="none"
            stroke="var(--workspace-grid)"
            strokeWidth={1}
          />
        </pattern>
        <pattern
          id="grid-major"
          width={major}
          height={major}
          patternUnits="userSpaceOnUse"
          patternTransform={`translate(${viewport.x} ${viewport.y})`}
        >
          <rect width={major} height={major} fill="url(#grid-minor)" />
          <path
            d={`M ${major} 0 L 0 0 0 ${major}`}
            fill="none"
            stroke="var(--workspace-grid-major)"
            strokeWidth={1.5}
          />
        </pattern>
      </defs>
      <rect className="grid" width="100%" height="100%" fill="var(--workspace)" />
      <rect className="grid" width="100%" height="100%" fill="url(#grid-major)" />
    </>
  )
}
