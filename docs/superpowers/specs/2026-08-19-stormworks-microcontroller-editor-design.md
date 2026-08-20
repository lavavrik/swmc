# Stormworks Microcontroller Editor — System Design

**Date:** 2026-08-19
**Status:** Approved (system level). Sub-project specs follow.

## 1. Goal

A browser-based, full-fidelity replica of the Stormworks: Build and Rescue
microcontroller editor:

- **Logic editor** — node graph on a pan/zoom canvas with drag-and-drop
  components, typed input/output ports, and wires; visually and behaviourally
  identical to the in-game editor.
- **Lua editor** — Monaco with Stormworks API completion and hover docs, plus a
  real Lua runtime executing `onTick`/`onDraw` with a live screen preview.
- **Simulation** — the whole graph evaluates at 60 Hz so signals can be watched
  flowing on the wires while editing.
- **Interop** — import and export Stormworks microprocessor `.xml` so designs
  round-trip with the game.

Non-goals (explicitly out of scope, possibly later):

- The vehicle editor, block placement, or anything outside a microcontroller.
- Multiplayer/collaborative editing, accounts, cloud storage, sharing links.
- A backend of any kind. The app is a static SPA.
- Physics simulation of the vehicle a microcontroller would be attached to.
- Byte-exact reproduction of in-game audio DSP. Audio signals are modelled as
  typed values and routed correctly, but never played.
- Camera feeds. A video signal carries what a script drew; nothing generates a
  picture from the world.

## 2. Product decisions

| Question | Decision |
|---|---|
| Purpose | Faithful editor first, simulation second — but the tick engine lands in phase 1 because the Lua live-run needs it |
| Format source of truth | Public wiki and open-source community parsers, since confirmed against a microcontroller saved by the game |
| Component coverage | The full library — 60 microcontroller component types, all categories |
| Graph engine | Custom SVG renderer — no React Flow, no canvas immediate mode |
| Lua editor | Monaco + full Stormworks API intellisense + wasmoon Lua execution + screen preview |
| Runtime | Browser SPA, local-only. IndexedDB project library, `.xml` import/export via file picker and drag-drop |
| Simulation depth | Full graph tick engine at 60 Hz with 1-tick delay on feedback edges |
| Visual target | Exact replica of the in-game skin (teal grid, white node cards, circular toolbar, coloured wires with arrowheads) |

## 3. Decomposition

The system is too large for one spec. It splits into five sub-projects, each
with its own spec, plan, and implementation cycle. Build order is top to bottom;
each depends only on those above it.

| # | Sub-project | Depends on | Deliverable |
|---|---|---|---|
| 1 | **Graph model + SVG editor** | — | Editable graph with placeholder components: place, move, wire, select, delete, undo, copy/paste, pan/zoom |
| 2 | **Component library** | 1 | All 60 components as declarative definitions; picker menu; property inspector |
| 3 | **XML interop + project library** | 1, 2 | Load and save Stormworks `.xml`; IndexedDB project list |
| 4 | **Tick engine** | 1, 2 | 60 Hz evaluation, stateful components, live signal values on wires, I/O panel |
| 5 | **Lua subsystem** | 1, 2, 4 | Monaco + SW API intellisense, wasmoon worker, `onTick`/`onDraw`, screen preview |

Rationale for the order: the model must exist before anything can be described
against it; components must exist before the XML codec has anything to map type
numbers onto; the tick engine needs component `eval` functions; the Lua node is
just one more component whose `eval` delegates to a worker.

## 4. Architecture

Strict layering. Each layer may import only from layers above it in this list.
Nothing below `editor/` imports React.

```
src/model/      Pure graph data types and operations. No React, no DOM.
src/library/    ComponentDef registry: ports, properties, eval, layout hints.
src/sim/        Tick scheduler and evaluator over the model.
src/lua/        wasmoon worker host, Stormworks API shim, screen raster.
src/io/         Stormworks XML codec, IndexedDB project store.
src/editor/     SVG canvas, viewport, interaction state machines. React.
src/ui/         App shell, toolbar, panels, Stormworks theme. React.
```

The point of the split is that the interesting logic — graph mutation, signal
evaluation, XML mapping — is plain TypeScript that can be unit-tested without
rendering anything, and that a rewrite of the rendering layer would not touch
it.

### 4.1 Stack

- **Vite** + **React** + **TypeScript** in `strict` mode.
- **Zustand** for the editor store, with the document held as an immutable
  value and mutated only through model operations.
- **Vitest** for unit tests, **Testing Library** for component tests,
  **Playwright** for canvas interaction tests (drag, wire, marquee select).
- **Monaco** for the Lua editor, bundled locally — editor core and the Lua
  grammar only. **wasmoon** (Lua 5.4 compiled to wasm) for execution, with its
  WebAssembly bundled rather than fetched from a CDN.
- **fast-xml-parser** for XML, wrapped so the codec owns all schema knowledge.

No component library, no CSS framework. The skin is bespoke CSS variables
mirroring the game's palette.

## 5. Data model (`src/model/`)

### 5.1 Signal types

Five signal types, matching the game, each with its own wire colour and its own
port-dot colour. Connections are type-checked: an output may only connect to an
input of the same type.

| Type | Meaning | Wire colour |
|---|---|---|
| `onoff` | Boolean | Red |
| `number` | 32-bit float | Green |
| `composite` | 32 numbers + 32 booleans in one channel | Purple |
| `video` | Frame buffer channel | Blue |
| `audio` | Audio channel | Olive |

Colours are sampled from the in-game editor and defined once, in
`src/ui/theme.css`.

Composite channels are 1-indexed in the UI (channels 1–32) as the game presents
them, and 0-indexed internally; the conversion lives in one place.

### 5.2 Document

```ts
type NodeId = string          // stable, generated on create
type PortId = { node: NodeId; kind: 'in' | 'out'; index: number }

interface GraphNode {
  id: NodeId
  type: ComponentTypeId       // key into the component registry
  position: { x: number; y: number }   // grid units, integers
  properties: Record<string, PropertyValue>
  label?: string
}

interface Wire {
  id: WireId
  from: PortId                // always an output
  to: PortId                  // always an input
}

interface Microcontroller {
  meta: { name: string; description: string; width: number; length: number }
  nodes: GraphNode[]
  wires: Wire[]
  ioOrder: NodeId[]           // the microcontroller's own external pins, in order
  idCounter: number           // kept in the document so operations stay pure
}
```

The microcontroller's external pins are ordinary nodes whose component type
belongs to the `io` category, mirroring how the game stores them as bridge
components. That means a wire endpoint has exactly one form, and the pins get
selection, dragging and undo for free. `ioOrder` records the order they appear
on the block's faces; translating that to and from the game's encoding is the
XML codec's problem, not the model's.

Invariants enforced by model operations, not by callers:

- An input port has at most one incoming wire; connecting a second replaces it.
- An output port may fan out to many inputs.
- Wires only connect matching signal types.
- No wire may connect a node to itself.
- Deleting a node deletes its wires.

### 5.3 Operations

All mutations are pure functions `(doc, args) => doc` in `model/ops.ts`:
`addNode`, `removeNodes`, `moveNodes`, `connect`, `disconnect`, `setProperty`,
`addIoNode`, `reorderIoNodes`, `paste`. Each returns a new document; none
throws on user error — they return a `Result` so the UI can show why an action
was refused.

### 5.4 Undo/redo

The document is a persistent immutable value, so a history entry is a labelled
past document rather than a diff — structural sharing means an entry costs a
few arrays, not a copy of the graph. The history is a bounded stack (200
entries). Continuous gestures (dragging a node) commit a single entry on
gesture end, not per pointer move, and consecutive edits carrying the same
label (typing in a property field) coalesce into one step.

## 6. Component library (`src/library/`)

Every component is a declarative definition — no per-component React code:

```ts
interface ComponentDef {
  id: ComponentTypeId          // our stable string id, e.g. 'arithmetic.add'
  swType: number               // the game's numeric type in XML
  category: Category           // Arithmetic | Logic | Comparison | Composite |
                               // Video | Audio | Data | Property
  name: string                 // display name, e.g. 'Add'
  description: string          // tooltip text, verbatim from the game
  inputs: PortDef[]            // label, signal type, optional
  outputs: PortDef[]
  properties: PropertyDef[]    // number / text / bool / dropdown / slider
  size?: { w: number; h: number }        // grid units; defaults from port count
  eval: EvalFn                 // pure, or stateful via the state slot
  stateful?: boolean
}
```

`EvalFn` has the shape `(inputs, properties, state) => { outputs, state }`, so
the tick engine never special-cases a component. Stateful components (memory
register, SR latch, capacitor, PID, delta, timers, counters) own their state
slot; everything else is combinational.

The catalogue covers all 60 component types the game numbers 0 to 59, one file
per category under `src/library/components/`, and a registry test asserts that
the numbering is complete and unique. Ports may be a function of the property
values rather than a fixed list, which is what the composite read and write
components need — their channel count decides how many ports they have.
Component `eval` functions that need the game's expression language
(`x*y+z`, `clamp(x,0,1)`) use the parser in `src/library/expression.ts` rather
than anything dynamic — saved files are untrusted input. The registry is the only
place that knows the game's numeric type ids, so a correction from a real save
file is a one-line change per component.

## 7. Editor (`src/editor/`)

### 7.1 Rendering

One SVG element covers the workspace. Layers, back to front:

1. Grid — a tiled `<pattern>`, so pan/zoom costs nothing.
2. Wires — one `<path>` each, coloured by signal type, with arrow markers
   placed along the path exactly as the game draws them.
3. Nodes — one `<g>` each: card background, icon, title, property summary
   lines, and port dots on the left and right edges.
4. Overlay — marquee rectangle, the wire currently being dragged, snap hints.

Cards use the game's own measurements: a component is **one game unit wide**,
and `0.25 × (ports + 1)` units tall — a rule that reproduces every height the
community library records, from a half-unit composite read to a composite write
that grows a quarter unit per channel. Those measurements belong to the
component rather than to any view, so they live in `library/geometry.ts`, which
the canvas turns into pixels and the codec needs for the position conversion. The game puts a small glyph in the corner of a card and the component's name
and settings beside it, and so does this. Every component has its own glyph,
drawn as stroked paths on a 24-unit grid rather than copied from the game's
artwork: paths stay sharp at any zoom, where a 32-pixel bitmap would not, and
nothing of the game's is redistributed. A component with no glyph of its own —
one from a newer version of the game — falls back to its category's — with one difference: the text is
drawn at a fixed size on screen rather than scaling with the workspace, so
zooming in does not inflate it. What the zoom changes is how much fits. Far out
a card is its glyph alone; closer in the name appears; closer still its
settings. The full detail is always a hover away.

Inputs are drawn as rings and outputs as solid dots, so which end of a wire is
which reads without following it, and the arrows along a wire march in the
direction the signal flows. The arrows start at the beginning of the wire's
middle run and stop one place short of its end, because the whole set animates
forward by exactly one spacing — keeping them on the wire is a property of the
geometry rather than something clipping has to enforce.

A wire lights up under the pointer, through a wide invisible path that makes it
easy to point at. Only wires the document holds carry that path: the one
following the cursor mid-drag must stay inert, or it sits under the pointer and
swallows its own drop.

A composite read or write only has a start-channel port when its channel is set
to 0, meaning "take it from the wire" — that is why the game's cards are a
quarter unit shorter than a naive count of their ports suggests.

Wires and text are drawn at a constant size on screen rather than scaling with
the canvas: zooming in shows more of the graph's detail, not fatter wires and
bigger letters. Strokes use `non-scaling-stroke` and type is divided by the
current zoom.

Node cards are SVG, not HTML-in-`foreignObject`, keeping DOM node counts low. A graph of ~1000 components
must stay interactive; if profiling shows otherwise, nodes outside the viewport
are culled before any other optimisation is considered.

### 7.2 Viewport

A single `{ x, y, scale }` transform. Pan with middle-drag, space-drag or a
two-finger swipe; zoom with the mouse wheel or a pinch, anchored at the
pointer. A wheel event does not say which device produced it, so the shape of
its deltas decides — coarse whole-number steps down the y axis are a wheel,
anything smaller or sideways is a trackpad — and that judgement lives in one
tested function. Screen↔world conversion lives in one
module and is unit-tested; nothing else does coordinate arithmetic.

### 7.3 Interaction

Pointer handling is an explicit state machine — `idle`, `panning`,
`draggingNodes`, `draggingWire`, `marqueeSelecting`, `resizing` — rather than
scattered event handlers. Each state declares what pointer-down, move, up, and
Escape do. This is the part of a node editor that rots fastest, so it is
modelled explicitly and tested with Playwright.

Node positions snap to the grid, matching the game. Wire drags snap to the
nearest compatible port within a radius; incompatible ports visibly dim while
dragging.

### 7.4 Keyboard

Replicates the in-game bindings where they exist, and follows platform
convention where they do not: delete, copy/cut/paste, undo/redo, select all,
duplicate, frame selection, zoom to fit.

## 8. Tick engine (`src/sim/`)

Runs at 60 Hz off `requestAnimationFrame` with a fixed-step accumulator, so
tick count stays correct under frame drops. One tick:

1. Read the microcontroller's external input pins from the I/O panel.
2. Evaluate components in a precomputed order.
3. Write the external output pins.
4. Publish a signal snapshot for the editor to render on wires.

Evaluation order is a topological sort of the graph. Cycles are broken by
marking back edges: a back edge delivers the **previous** tick's value, giving
the 1-tick feedback delay that Stormworks exhibits. The sort is recomputed only
when the graph structure changes, not per tick.

The engine is a plain class with `step()`, driven by React but not aware of it.
Tests drive it directly and assert values over sequences of ticks — this is how
stateful-component semantics get pinned down.

Signal values are surfaced in the UI as small labels on wires and as colour
intensity, toggleable, matching the game's debug display.

**Known risk:** the game's exact evaluation order within a tick is not
authoritatively documented. The chosen semantics are stated here as the
assumption and isolated in the scheduler, so correcting them later is one
module's change. Divergences found against real microcontrollers get recorded
as regression tests.

## 9. Lua subsystem (`src/lua/`)

The Lua script component's `eval` hands its inputs to a worker and takes back
the outputs produced by the last completed tick.

- **Runtime:** wasmoon, one interpreter per script node, reset on script
  change. It provides Lua 5.4 where the game runs 5.3; the differences do not
  reach ordinary microcontroller scripts, but this is a known divergence rather
  than an exact match. It runs synchronously on the main thread rather than in a worker:
  a tick has to see this tick's inputs and be read back within the same tick,
  and a worker round-trip would lag every script by one tick. The cost of that
  choice is that a runaway script would block the page, which is why the
  interpreter's instruction hook aborts a tick that overruns its budget.
- **API shim:** `input.getNumber/getBool`, `output.setNumber/setBool`,
  `property.getNumber/getBool/getText`, the full `screen.*` drawing surface,
  `map.*`, `async.*`, and the game's table/string extensions. The shim is the
  single source of truth for both execution and intellisense.
- **Screen:** `screen.*` calls are recorded as a display list, which is what a
  video signal carries — routed through switchboxes and output pins unchanged
  and rasterised only where it is looked at, so one frame can be drawn at any
  monitor's size.
- **Rasterising:** a monitor is 32 pixels across at its smallest, so drawing
  goes through a hand-written rasteriser rather than a canvas: Bresenham lines,
  a midpoint circle shared between outline and fill, scanline triangles, and
  the game's own bitmap font. Nothing is smoothed — a diagonal is a staircase
  on a real monitor and it should be one here. The font is extracted from a
  local installation of the game by `scripts/extract-tiny-font.mjs`, which
  reads the BMFont pair the game ships and writes out one bitmask per glyph
  row.
- **Touch:** a monitor in the game reports back over composite — its size on
  number channels 1 and 2, the touch position on 3 and 4, and whether it is
  being touched on on/off channel 1. The script editor's monitor does the same,
  so a touch interface can be built and tried without leaving the editor.
- **Monitors:** the game has no monitor component inside a microcontroller —
  a monitor is a block on the vehicle — so a monitor here is an instrument
  rather than a component. It attaches to any port that *emits* video — an output, or one of the
  microcontroller's own output pins (double-click the port, or use the property
  panel) — and watches it without touching the document, which keeps saved files unaffected by where it is pointed.
  Attaching one tells the scripts upstream how big the screen is, which is what
  `screen.getWidth()` answers, and a script with nothing watching it does not
  run `onDraw` at all — as in the game.
- **Limits:** the editor shows both script limits — 4096 characters in the base
  game and 8192 with the Space DLC — warning at each rather than blocking, so a
  script that needs the DLC is visible as such.
- **Minifying:** a lexer drops comments and unnecessary spacing, keeping the
  line breaks that carry meaning, and shortens the names. Renaming without a
  parser is safe because it is bijective and global — every occurrence of a
  name becomes the same new one, so whatever the scoping was, it survives.
  What is left alone is everything that is not a variable: reserved words, the
  standard library, the game's API, the callbacks it calls by name, fields
  after a dot or colon, and the keys of a table constructor. A script that
  could reach a name as a string, through `_G` or `load`, is not renamed at
  all, and says so. Every renameable name takes a fresh one from the pool
  rather than keeping a short original, because a kept name leaves the pool
  free to hand the same one to something else.
  The result is shown beside the script rather than replacing it; replacing is
  a separate, undoable choice. On the thermostat that ships as a test fixture
  it is a 38% saving, verified by running both versions tick for tick and
  requiring identical outputs and drawing.
- **Safety:** a per-tick instruction budget aborts runaway scripts; a worker
  crash surfaces as an error banner on the node rather than killing the app.

Intellisense is generated from the same API description that the shim
implements, so the two cannot drift.

## 10. XML interop (`src/io/`)

A codec with two entry points, `parseMicrocontroller(xml)` and
`serializeMicrocontroller(doc)`, plus a schema module holding every piece of
game-format knowledge: element and attribute names, the numeric component type
table, port index conventions, and the bridge/property component encoding.

Requirements:

Files reach the codec three ways: a picker, a drop onto the workspace, and a
drop onto the open dialog. The picker is opened by a `<label>` wrapping the
input rather than by calling `click()` on a hidden one, because Safari and
Firefox refuse the latter.

- **Round-trip fidelity.** Parsing then serializing a file reproduces it
  semantically. Attributes the editor does not understand are preserved
  verbatim on the node they belong to and written back out.
- **Graceful degradation.** An unknown component type imports as an opaque
  placeholder node that keeps its attributes and wires, so an unsupported file
  is still editable and still saves correctly.
- **Golden-file tests.** Every fixture in `src/io/__fixtures__/` must
  round-trip: parsing, serializing and parsing again yields the same document,
  and attributes the editor does not model survive verbatim.

The schema was derived from public sources and then checked against a
microcontroller saved by the game. That confirmed the position scale and the
upward y axis, and corrected several things: a `<c>` element with no `type`
attribute means type 0, the NOT component, because the game omits the default;
and a channel offset of `-1` means the start channel comes from the component's
`off` input rather than from its property, in which case — and only then — the
component has a port for it. The same setting is also stored under two
different attribute names: `i` on a read, `offset` on a write. And a saved
position names a component's **bottom** edge, not its top — the natural origin
for an axis that measures upwards — so converting one needs the component's
height, without which a column of different-sized components drifts out of
line. Attributes the editor does not model
— the 16×16 icon, the group's `data` type — ride along untouched.

The project library stores documents in IndexedDB (id, name, thumbnail,
updated-at, document). Import accepts file picker and drag-drop; export
downloads a `.xml`. The File System Access API — binding the game's
`microprocessors` folder directly — is deliberately deferred until the codec is
proven.

## 11. UI shell (`src/ui/`)

Replicates the in-game layout from the reference screenshot: a dark top bar of
circular icon buttons (new, open, save, workshop, 3D preview, tooltips, undo,
redo, copy, cut, paste), the teal gridded workspace, and a bottom bar with the
microcontroller size controls and the component picker button.

Panels: component picker (categorised, searchable), property inspector for the
selection, the microcontroller's pin editor (naming, ordering, signal type and
face position, since these are what the vehicle sees rather than per-component
settings), simulation controls with the external input values, the monitor
instrument, and the Lua editor opening as a full-height overlay.

Colours, fonts, and metrics live in one theme module as CSS custom properties,
sourced from the screenshot, so the skin is adjustable in one file.

## 12. Testing strategy

| Layer | How it is tested |
|---|---|
| `model` | Unit tests per operation, plus invariant property tests |
| `library` | Table-driven `eval` tests per component; a registry integrity test asserting unique ids, unique `swType`, and complete metadata |
| `sim` | Multi-tick scenario tests, including feedback loops and every stateful component |
| `lua` | Worker integration tests: script in, outputs and screen display list out |
| `io` | Golden-file round-trip tests |
| `editor` | Playwright interaction tests: place, drag, wire, marquee, undo |
| `ui` | Testing Library for panels; no snapshot tests of the canvas |

Development follows TDD: each sub-project's plan writes tests before
implementation for `model`, `library`, `sim`, and `io`, which is where
correctness actually lives.

## 13. Open questions

None blocking. Two assumptions are recorded above and isolated behind single
modules: the XML schema (§10) and the tick evaluation order (§8). Both are
expected to need correction once a real microcontroller file is available, and
both are cheap to correct by design.

## 14. Progress

All five sub-projects are complete, covered by 198 unit tests and 12 Playwright
interaction tests.

| # | Sub-project | State |
|---|---|---|
| 1 | Graph model + SVG editor | Done |
| 2 | Component catalogue (60 types) | Done |
| 3 | XML interop + project library | Done |
| 4 | Tick engine | Done |
| 5 | Lua subsystem | Done |

A microcontroller saved by the game is now a fixture, and it round-trips: all
51 components, 64 wires, the script, the icon. It confirmed the position scale
and y direction, and corrected the missing-`type` default.

One assumption still awaits confirmation, isolated as promised: the
metres-per-pixel meaning of the map zoom in `lua/prelude.ts`. The evaluation
order within a tick (§8) is likewise confined to `sim/plan.ts`.
