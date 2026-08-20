/**
 * Pointer interaction as an explicit state machine.
 *
 * Canvas editors rot when pointer handling is spread across event handlers, so
 * every gesture lives here as a pure reducer: `(state, event, context) =>
 * { state, intents }`. It never touches the document — it emits intents that
 * the store turns into model operations, which keeps it trivially testable and
 * means a gesture can be cancelled at any moment by dropping the state.
 *
 * Gestures are previewed from the machine's own state (a drag offset, a rubber
 * band, a wire following the cursor) and only committed on release, so a whole
 * drag is a single undo step.
 */
import { GRID_PX } from '../layout'
import { boundsFromCorners, type Bounds } from '../viewport'
import type { NodeId, Point, PortId, WireId } from '@/model/types'

export type HitTarget =
  | { readonly kind: 'canvas' }
  | { readonly kind: 'node'; readonly id: NodeId }
  | { readonly kind: 'port'; readonly port: PortId }

export type InteractionEvent =
  | {
      readonly type: 'pointerDown'
      readonly target: HitTarget
      readonly screen: Point
      readonly world: Point
      /** DOM button number: 0 left, 1 middle. */
      readonly button: number
      readonly shift: boolean
      /** Whether the space bar is held, which turns a left drag into a pan. */
      readonly space: boolean
    }
  | {
      readonly type: 'pointerMove'
      readonly screen: Point
      readonly world: Point
      readonly hover: HitTarget
    }
  | { readonly type: 'pointerUp'; readonly hover: HitTarget }
  | { readonly type: 'escape' }

export type InteractionState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'panning'; readonly lastScreen: Point }
  | {
      readonly kind: 'draggingNodes'
      readonly nodes: readonly NodeId[]
      readonly startWorld: Point
      /** Drag offset in whole grid units — the game snaps as you drag. */
      readonly gridDelta: Point
    }
  | {
      readonly kind: 'draggingWire'
      /** The port the drag started from; may be an input or an output. */
      readonly origin: PortId
      readonly cursorWorld: Point
      readonly hover: PortId | null
      /**
       * The wire being carried, when the drag began on an input that already
       * had one. Dropping it somewhere moves that wire rather than making
       * another; dropping it nowhere takes it off.
       */
      readonly detaching: WireId | null
    }
  | {
      readonly kind: 'marquee'
      readonly startWorld: Point
      readonly currentWorld: Point
      readonly additive: boolean
    }

export type Intent =
  | { readonly type: 'pan'; readonly delta: Point }
  | { readonly type: 'selectOnly'; readonly ids: readonly NodeId[] }
  | { readonly type: 'toggleSelect'; readonly id: NodeId }
  | { readonly type: 'selectIn'; readonly bounds: Bounds; readonly additive: boolean }
  | { readonly type: 'moveNodes'; readonly ids: readonly NodeId[]; readonly gridDelta: Point }
  | { readonly type: 'connect'; readonly from: PortId; readonly to: PortId }
  | { readonly type: 'moveWireEnd'; readonly wire: WireId; readonly to: PortId }
  | { readonly type: 'disconnect'; readonly wire: WireId }

export interface InteractionContext {
  readonly selection: readonly NodeId[]
  /** Whether a wire between these two ports would be accepted. */
  canConnect(from: PortId, to: PortId): boolean
  /** The wire ending at this input, if it has one. */
  wireInto(port: PortId): { readonly id: WireId; readonly from: PortId } | undefined
}

export interface Transition {
  readonly state: InteractionState
  readonly intents: readonly Intent[]
}

export const IDLE: InteractionState = { kind: 'idle' }

const stay = (state: InteractionState, intents: readonly Intent[] = []): Transition => ({
  state,
  intents,
})

const snapToGrid = (from: Point, to: Point): Point => ({
  x: Math.round((to.x - from.x) / GRID_PX),
  y: Math.round((to.y - from.y) / GRID_PX),
})

/** Whether dropping here would put a carried wire back where it started. */
function sameEnd(to: PortId, wire: WireId, ctx: InteractionContext): boolean {
  const existing = ctx.wireInto(to)
  return existing?.id === wire
}

/** Puts a pair of ports into wire order, or null if they cannot form a wire. */
function orient(a: PortId, b: PortId): { from: PortId; to: PortId } | null {
  if (a.kind === 'out' && b.kind === 'in') return { from: a, to: b }
  if (a.kind === 'in' && b.kind === 'out') return { from: b, to: a }
  return null
}

export function reduce(
  state: InteractionState,
  event: InteractionEvent,
  ctx: InteractionContext,
): Transition {
  if (event.type === 'escape') return stay(IDLE)

  switch (event.type) {
    case 'pointerDown':
      return onPointerDown(event, ctx)
    case 'pointerMove':
      return onPointerMove(state, event)
    case 'pointerUp':
      return onPointerUp(state, event, ctx)
  }
}

function onPointerDown(
  event: Extract<InteractionEvent, { type: 'pointerDown' }>,
  ctx: InteractionContext,
): Transition {
  if (event.button === 1 || event.space) {
    return stay({ kind: 'panning', lastScreen: event.screen })
  }
  if (event.button !== 0) return stay(IDLE)

  switch (event.target.kind) {
    case 'port': {
      const port = event.target.port
      // Starting on an input that already has a wire picks that wire up by its
      // end, rather than beginning a second one the input could not take
      const existing = port.kind === 'in' ? ctx.wireInto(port) : undefined
      return stay({
        kind: 'draggingWire',
        origin: existing ? existing.from : port,
        cursorWorld: event.world,
        hover: null,
        detaching: existing?.id ?? null,
      })
    }

    case 'node': {
      const id = event.target.id
      const selected = ctx.selection.includes(id)
      if (event.shift) {
        // Shift-clicking adjusts the selection rather than starting a drag
        return stay(IDLE, [{ type: 'toggleSelect', id }])
      }
      const nodes = selected ? [...ctx.selection] : [id]
      return stay(
        { kind: 'draggingNodes', nodes, startWorld: event.world, gridDelta: { x: 0, y: 0 } },
        selected ? [] : [{ type: 'selectOnly', ids: [id] }],
      )
    }

    case 'canvas':
      return stay(
        {
          kind: 'marquee',
          startWorld: event.world,
          currentWorld: event.world,
          additive: event.shift,
        },
        event.shift ? [] : [{ type: 'selectOnly', ids: [] }],
      )
  }
}

function onPointerMove(
  state: InteractionState,
  event: Extract<InteractionEvent, { type: 'pointerMove' }>,
): Transition {
  switch (state.kind) {
    case 'panning':
      return stay({ kind: 'panning', lastScreen: event.screen }, [
        {
          type: 'pan',
          delta: {
            x: event.screen.x - state.lastScreen.x,
            y: event.screen.y - state.lastScreen.y,
          },
        },
      ])

    case 'draggingNodes':
      return stay({ ...state, gridDelta: snapToGrid(state.startWorld, event.world) })

    case 'draggingWire':
      return stay({
        ...state,
        cursorWorld: event.world,
        hover: event.hover.kind === 'port' ? event.hover.port : null,
      })

    case 'marquee':
      return stay({ ...state, currentWorld: event.world })

    case 'idle':
      return stay(state)
  }
}

function onPointerUp(
  state: InteractionState,
  event: Extract<InteractionEvent, { type: 'pointerUp' }>,
  ctx: InteractionContext,
): Transition {
  switch (state.kind) {
    case 'draggingNodes': {
      const moved = state.gridDelta.x !== 0 || state.gridDelta.y !== 0
      return stay(
        IDLE,
        moved ? [{ type: 'moveNodes', ids: state.nodes, gridDelta: state.gridDelta }] : [],
      )
    }

    case 'draggingWire': {
      const dropped = event.hover.kind === 'port' ? event.hover.port : null
      const oriented = dropped ? orient(state.origin, dropped) : null
      const lands = oriented !== null && ctx.canConnect(oriented.from, oriented.to)

      if (state.detaching !== null) {
        // Put back where it came from, moved to a new input, or taken off
        if (dropped && oriented && sameEnd(oriented.to, state.detaching, ctx)) return stay(IDLE)
        if (lands && oriented) {
          return stay(IDLE, [{ type: 'moveWireEnd', wire: state.detaching, to: oriented.to }])
        }
        return stay(IDLE, [{ type: 'disconnect', wire: state.detaching }])
      }

      if (!lands || !oriented) return stay(IDLE)
      return stay(IDLE, [{ type: 'connect', from: oriented.from, to: oriented.to }])
    }

    case 'marquee': {
      const dragged =
        state.startWorld.x !== state.currentWorld.x || state.startWorld.y !== state.currentWorld.y
      return stay(
        IDLE,
        dragged
          ? [
              {
                type: 'selectIn',
                bounds: boundsFromCorners(state.startWorld, state.currentWorld),
                additive: state.additive,
              },
            ]
          : [],
      )
    }

    case 'panning':
    case 'idle':
      return stay(IDLE)
  }
}
