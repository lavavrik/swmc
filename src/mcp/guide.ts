/**
 * What an agent needs to know before it writes a recipe. `INSTRUCTIONS` goes
 * out with the MCP handshake; `GUIDE` is the `guide` tool, read on demand.
 *
 * Keep the Stormworks notes in step with AGENTS.md.
 */

export const INSTRUCTIONS = `swmc builds Stormworks microcontrollers from recipes (named nodes, named ports, YAML or JSON) and saves game-loadable XML to the user's library, where the swmc editor opens it.

Never write Stormworks XML by hand. The loop:
1. Call \`guide\` once for the recipe format and the vehicle rules. \`example_recipe\` shows complete recipes.
2. \`list_components\` for type ids, port slugs and property keys.
3. \`build_microcontroller\` with the recipe. It validates, saves, and returns the editor link. Fix the errors it reports and call it again.
4. \`simulate\` to tick the pins with values you choose, over one or more phases.
To change an existing microcontroller: \`get_microcontroller\` (returns its recipe), edit, then \`build_microcontroller\` with the same slug and replace: true.`

export const GUIDE = `# swmc recipes

A recipe is a microcontroller described with named nodes and named ports. \`build_microcontroller\` turns it into the XML Stormworks loads.

\`\`\`yaml
name: Throttle Limiter          # required; the slug comes from it unless you pass one
description: Clamps the throttle
width: 2                         # block size 1–6; omit to fit the pin count
length: 1
pins:                            # the block's own inputs and outputs
  - id: throttle_in              # the name simulate sets it by
    dir: in                      # in | out
    signal: number               # onoff | number | composite | video | audio
    label: Throttle In           # shown in game; defaults to id
    description: the requested throttle
  - { id: throttle_out, dir: out, signal: number, label: Throttle Out }
nodes:
  - id: clamp                    # letters, digits, underscore; no dots
    type: arithmetic.clamp       # a type id from list_components
    min: 0                       # any other key is a property (list_components shows keys)
    max: 0.75
  - { id: scale, type: arithmetic.function1, expression: x*2 }
wires:
  - { from: throttle_in, to: clamp }
  - { from: clamp, to: scale }
  - { from: scale, to: throttle_out }
\`\`\`

- A wire end is \`node\` when that side of the node has one port, else \`node.port\`: the port's slug (\`pid.setpoint\`, \`sw.value-on\`), a unique prefix of it, or \`node.in.0\` / \`node.out.1\`.
- \`position: { x, y }\` on a node is optional (grid units). Omit it and layout is automatic. Recipes from \`get_microcontroller\` keep the positions they had.
- Pins can take \`faceX\` / \`faceZ\` to place them on the block; omit them and they are packed in order.
- Property keys and port slugs come from \`list_components\`, not from XML attribute names (\`expression\`, not \`e\`).
- Unconnected number inputs read 0. Do not add a Constant Number of 0.

## Nodes or Lua

- Prefer nodes for small logic.
- Use one \`data.luaScript\` (property \`script\`) with composite pins when the graph would be large or needs a display (\`onDraw\`). The limit is 4096 characters (8192 with the Space DLC). \`simulate\` runs Lua \`onTick\` too.

## simulate

The tick engine is the microcontroller only. Engine RPS, battery charge and wheel speed are pin values you set, not a vehicle model. A composite value is \`13=20,2=0.5\` (channel=value); a bare number sets channel 2 (seat W/S). On/off takes on/off/true/false. Phases run back to back on one simulation, so latches, timers and Lua state carry over; a pin keeps its value until a later phase sets it again.

## Stormworks vehicle I/O

- Pipes carry both RPS/torque and fluid. Clutches and gearboxes pass RPS, not fluid.
- Clutches take a number 0..1, never on/off. 0 is disconnected, 1 is locked.
- Engine controllers take on/off (run) plus throttle 0..1. Motors take throttle 0..1; reverse is a separate on/off.
- Electric motors freewheel at about 20 RPS at throttle 1.
- Seat composite: number ch 1 A/D, 2 W/S, 3 left/right, 4 up/down. On a car, W is throttle and S is brake (max(x,0) / max(-x,0)).
- Physics sensor composite: number ch 13 is absolute linear speed (m/s).
- Never lock a clutch from a starting diesel to the wheels; the starter will roll the car. Keep the drive clutch at 0 until engine RPS is above idle.
- A traction motor can crank the diesel: lock engine↔motor, open motor→wheels, run the motor until RPS > idle.
- Gearboxes take on/off and switch between two ratios set on the block. Stack n boxes for 2^n gears; output one on/off per box. Ratios multiply. They need power to switch and are about 95% efficient.
- The block offers eight ratios only: -1:1, 1:1, 6:5, 3:2, 9:5, 2:1, 5:2, 3:1. Arrows toward the power source give more RPS (3:1 → ×3); away give more torque (3:1 → ÷3). -1:1 is reverse.
- Shift on shaft RPS after the motor, not on wheel RPS or ECU idle RPS.

## Delivering

\`build_microcontroller\` saves to the user's library and returns a link that opens it in the editor. Give the user that link. From the editor they export the XML to Stormworks/data/microprocessors.
`
