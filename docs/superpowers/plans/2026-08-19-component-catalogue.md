# Sub-project 2 — The component catalogue

## Context

Sub-project 1 left the library with eight seed components. This adds the whole
in-game set: **60 microcontroller component types**, numbered 0–59 in saved
files. The numeric ids come from [sw_mc_lib][swmclib]; port shapes and
semantics from the [wiki][wiki] and the community [logic reference guide][guide].

The count of 60 replaces the "~100 components" estimate in the system design —
60 is the real number of microcontroller logic component types.

[swmclib]: https://github.com/stormworks-utils/sw_mc_lib
[wiki]: https://stormworks.fandom.com/wiki/Gameplay/Workbench/Components/Logic
[guide]: https://steamcommunity.com/sharedfiles/filedetails/?id=2087537058

## The blocker: ports depend on properties

Composite Read and Composite Write expose a variable number of ports — their
`channel count` property decides how many channels are wired, which is what the
"active inputs: 2, 3" line on an in-game card reports. The current
`ComponentDef` has fixed `inputs`/`outputs` arrays and `GraphSchema` answers
port questions from the component _type_ alone.

So this lands first:

1. `PortDef[] | (properties) => PortDef[]` for `inputs` and `outputs`, resolved
   through one helper, `resolvePorts(def, kind, properties)`. Static components
   keep their plain arrays.
2. `GraphSchema` methods take the node's properties as well as its type.
   `ops.connect` and `queries.isConnectable` already have the node in hand.
3. `nodeSize` keys its memo on the resolved port counts rather than the
   definition object.

## Components

| File            | Types                                                                                                                                                                                                                                                                        |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `logic.ts`      | NOT 0, AND 1, OR 2, XOR 3, NAND 4, NOR 5, SR Latch 24, JK Flip Flop 25, Capacitor 26, Blinker 27, Push To Toggle 28, Pulse 48, Boolean Function 4-in 46, Boolean Function 8-in 47                                                                                            |
| `arithmetic.ts` | Add 6, Subtract 7, Multiply 8, Divide 9, Modulo 38, Abs 14, Clamp 11, Delta 35, Function 1-in 45, Function 3-in 10, Function 8-in 36, Numerical Junction 21, Numerical Switchbox 22, Up/Down Counter 37, Memory Register 13, PID Controller 23, PID Controller (advanced) 39 |
| `comparison.ts` | Threshold 12, Greater Than 17, Less Than 18, Equal 42                                                                                                                                                                                                                        |
| `constants.ts`  | Constant Number 15, Constant On 16                                                                                                                                                                                                                                           |
| `timers.ts`     | Timer TON 49, TOF 50, RTO 51, RTF 52                                                                                                                                                                                                                                         |
| `composite.ts`  | Composite Read on/off 29, Composite Read number 31, Composite Write on/off 41, Composite Write number 40, deprecated writes 30 and 32, Composite Switchbox 53, Number to Composite Binary 54, Composite Binary to Number 55                                                  |
| `properties.ts` | Property Slider 19, Dropdown 20, Toggle 33, Number 34, Text 58                                                                                                                                                                                                               |
| `tooltips.ts`   | Tooltip Number 43, Tooltip On/Off 44                                                                                                                                                                                                                                         |
| `av.ts`         | Video Switchbox 57, Audio Switchbox 59                                                                                                                                                                                                                                       |
| `lua.ts`        | Lua Script 56                                                                                                                                                                                                                                                                |
| `io.ts`         | The microcontroller's own pins (no `swType` — bridge components)                                                                                                                                                                                                             |

Stateful components (latches, timers, counters, memory, capacitor, blinker,
delta, PID) carry their state in the eval state slot, so the tick engine in
sub-project 4 needs no special cases.

## Tests

- Registry integrity, extended: every id 0–59 present exactly once, and every
  definition's ports resolve for its default properties.
- Table-driven `eval` tests per category, including multi-tick sequences for the
  stateful components (latch set/reset, timer completion, counter limits, delta,
  capacitor charge/discharge, PID convergence).
- Dynamic-port tests: changing `channel count` on a Composite Write changes its
  port count, and removes wires that no longer have a port to land on.

## Verification

```bash
npm run typecheck && npm run lint && npm test && npm run test:e2e
```

Plus placing one component from each category in the running app and checking
the cards, port colours and property editors against the reference screenshot.
