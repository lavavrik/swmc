# Agent notes

## Microcontrollers

When the user wants a microcontroller (engine, hybrid, throttle, logic pack),
do **not** write Stormworks XML by hand.

1. `npm run mc -- catalog --json` — type ids, port slugs, property keys.
2. Write `recipes/<slug>.yaml`. Copy the shape of `recipes/hybrid-full.yaml`.
3. `npm run mc -- build recipes/<slug>.yaml --open` → `microcontrollers/<slug>.xml` and the editor at `/?open=<slug>`.
4. `npm run mc -- sim recipes/<slug>.yaml --ticks 60 --set pin=value`.

Prefer node-graph recipes when the result must be simulated here. Prefer one
Lua Script plus composite pins when the graph would be large or needs a
display — Lua is not executed by `mc sim` (the interpreter is browser/wasm).

The tick engine is the microcontroller only. Engine RPS, battery charge and
wheels are pin values you set, not a vehicle plant.

## Stormworks vehicle I/O

- **Clutches take a number 0..1**, never on/off. 0 is disconnected, 1 is locked.
- **Never lock a clutch from a starting diesel to the wheels.** The starter will roll the car. Keep the **drive** clutch at 0 until engine RPS is above idle.
- **The traction motor can crank the diesel:** lock engine↔motor, open motor→wheels, run the motor until RPS > idle. Do not lock the engine-driven generator until it is running.
- **Gearboxes take on/off** and switch between two ratios set on the block. Stack n boxes for 2^n gears; the MCU outputs one on/off per box (binary gear). Ratios multiply in series. Need power to switch. 95% efficient.

### Stormworks gearbox ratios

The block only offers **8 settings**: `-1:1`, `1:1`, `6:5`, `3:2`, `9:5`, `2:1`, `5:2`, `3:1`. There is no 1:3 in the menu — the label always reads the larger number first. **Flip the box** to invert:

- arrows **toward the power source** (motors/engine): more shaft RPS, less torque (`3:1` → wheels ×3)
- arrows **away from the power source**: more torque, less RPS (`3:1` → wheels ÷3)

`-1:1` is reverse. Gearboxes need power to switch. ~95% efficient.

**Hybrid Full (3 MCU outputs, binary, gear 1 = all off).** Mix one reduction box with two overdrive boxes so 4th/5th sit near 1:1:

| Box               | Arrows           | Off | On  |
| ----------------- | ---------------- | --- | --- |
| Gearbox 1 (bit 0) | toward motors    | 1:1 | 6:5 |
| Gearbox 2 (bit 1) | toward motors    | 1:1 | 3:2 |
| Gearbox 3 (bit 2) | away from motors | 2:1 | 1:1 |

Wheel / motor RPS:

| Gear | GB1 | GB2 | GB3 | ×    |
| ---- | --- | --- | --- | ---- |
| 1    | off | off | off | 0.50 |
| 2    | on  | off | off | 0.60 |
| 3    | off | on  | off | 0.75 |
| 4    | on  | on  | off | 0.90 |
| 5    | off | off | on  | 1.00 |
| 6    | on  | off | on  | 1.20 |
| 7    | off | on  | on  | 1.50 |
| 8    | on  | on  | on  | 1.80 |

Reverse is Motor Reverse; an extra `1:1` / `-1:1` box is optional.

- Engine controllers take on/off (run) plus throttle 0..1.
- Motors take throttle 0..1; reverse is a separate on/off.

The **live editor** is https://swmc.example.com — same `/?open=<slug>` after a deploy. Cloud library is per-account (email + password, Postgres). Agents still **author** in this repo (`npm run mc`); the hosted SPA does not run the CLI.

Details: `docs/agents.md`.
