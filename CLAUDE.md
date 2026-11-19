# Agent notes

## Microcontrollers

When the user wants a microcontroller (engine, hybrid, throttle, logic pack),
do **not** write Stormworks XML by hand.

If the `swmc` MCP server is connected (tools `build_microcontroller`,
`simulate`, `get_microcontroller`, …), use it: it does the same as the steps
below and saves where the user's editor opens it. Setup is in
`docs/agents.md`; this repo's `.mcp.json` starts it in folder mode.

1. `npm run mc -- catalog --json` — type ids, port slugs, property keys.
2. Write `recipes/<slug>.yaml`. Copy the shape of `recipes/hybrid-full.yaml`.
3. `npm run mc -- build recipes/<slug>.yaml --open` → `microcontrollers/<slug>.xml` and the editor at `/?open=<slug>`.
4. `npm run mc -- sim recipes/<slug>.yaml --ticks 60 --set pin=value`.

Prefer node-graph recipes for small logic. Prefer one Lua Script plus
composite pins when the graph would be large or needs a display. `mc sim` and
the MCP `simulate` tool run Lua `onTick` (not `onDraw`). A large script can sit
in its own file (`script_file: ctrl.lua` on the node, relative to the recipe).
The export minifies Lua and the game runs that: `mc sim --minified` runs it the
same way, and the MCP tools warn when the minified script behaves differently.

The tick engine is the microcontroller only. Engine RPS, battery charge and
wheels are pin values you set, not a vehicle plant.

## Stormworks vehicle I/O

- **Pipes are universal:** the same pipe blocks carry **RPS/torque** and **fluid**. A cross can carry both. Clutches and gearboxes pass RPS, not fluid.
- **Electric motors** freewheel at about **20 RPS** at throttle 1 (small/medium/large). Couple a diesel 1:1 onto that shaft if it should push the wheels with the motor.
- **Clutches take a number 0..1**, never on/off. 0 is disconnected, 1 is locked.
- **Unconnected number inputs read as 0.** Do not add a Constant Number of 0.
- **Seat composite (Seat data):** number ch 1 A/D, **2 W/S**, 3 left/right, 4 up/down. On a car, W is throttle and S is brake (`max(x,0)` / `max(-x,0)`).
- **Physics sensor composite:** number ch 13 is absolute linear speed (m/s).
- **Never lock a clutch from a starting diesel to the wheels.** The starter will roll the car. Keep the **drive** clutch at 0 until engine RPS is above idle.
- **The traction motor can crank the diesel:** lock engine↔motor, open motor→wheels, run the motor until RPS > idle. Do not lock the engine-driven generator until it is running.
- **Gearboxes take on/off** and switch between two ratios set on the block. Stack n boxes for 2^n gears; the MCU outputs one on/off per box (binary gear). Ratios multiply in series. Need power to switch. 95% efficient.
- **Shift on shaft RPS (after the motor)**, not wheel RPS or ECU idle. ECU Engine RPS is for start and idle only.
- Engine controllers take on/off (run) plus throttle 0..1.
- Motors take throttle 0..1; reverse is a separate on/off.

### Gearbox ratios

The block only offers **8 settings**: `-1:1`, `1:1`, `6:5`, `3:2`, `9:5`, `2:1`, `5:2`, `3:1`. There is no 1:3 in the menu — the label always reads the larger number first. **Flip the box** to invert:

- arrows **toward the power source** (motors/engine): more shaft RPS, less torque (`3:1` → wheels ×3)
- arrows **away from the power source**: more torque, less RPS (`3:1` → wheels ÷3)

`-1:1` is reverse.

## The example vehicles

Each recipe's `.md` beside it is the vehicle wiring and the reasoning behind
its pins: `recipes/diesel.md` (diesel + starter motor, 8 speeds, touch cruise;
diagram at `/diesel-wiring.html`) and `recipes/hybrid-full.md` (hybrid,
8 speeds; diagram at `/hybrid-full-wiring.html`). Read the one you are
changing before you edit its recipe.
