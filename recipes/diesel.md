# Diesel — vehicle wiring

MCU: `recipes/diesel.yaml` → `microcontrollers/diesel.xml`  
Open: `/?open=diesel`

Diesel + 8-speed. The electric motor is a **starter on a T-off** so it can help later. ECU still owns idle. This MCU: throttle, starter, clutches, gears, brakes.

## Why not wheel-RPS shift

The old hybrid shifted on **wheel RPS / 4**. 3rd gear is 0.75×, so the diesel had to hit ~16 RPS at the wheels-threshold to get 4th — it never did. Stuck in 3rd at ~22 m/s.

This MCU shifts on **Shaft RPS** (sensor **after the motor**): up at 12, down at 7. ECU Engine RPS is only for start/idle. When the diesel is in, shaft RPS matches engine RPS.

## Shaft

The engine **must** output through its own clutch. After that, a pipe T:

```
Engine — Engine clutch — T ┬— Starter clutch — Motor
                           ├— Regen clutch — Generator
                           └— Drive clutch — GB1 — GB2 — GB3 — Wheels
```

Motor is **not** in series on the drive shaft. Transmission (drive clutch + boxes) is unchanged.

**Crank:** ignition on, engine RPS < **Start RPS** (3): engine clutch 1, starter clutch 1, motor = `Starter throttle` (0.4), **drive clutch 0** so the car does not roll.

**After start:** motor follows the pedal while it is rising or held. The seat W/S axis is slow — **~2% off the last peak** coasts: motor 0, starter clutch 0, regen clutch 1 (HUD **C**). Pushing the pedal up again brings the motor back. **Diesel from gear** default 3; **Hybrid gears** default 4. Battery &lt; 50% latches diesel from 1st until SOC ≥ 75%. Regen clutch stays **0** when battery ≥ 99%.

Engine clutch stays 1 with ignition.

Drive clutch 0 until idle, then **fades in slowly** from standstill (`Clutch fade` default 0.025; 1st uses half of that). Once moving it **stays locked** on lift-off so engine RPS can keep downshifting (not just once). Below **Start RPS** (3) it opens so the diesel is not dragged dead. Idle RPS hunting 4–5 no longer flips START/IDLE+ — alive latches at 5 and only clears below 3.

On a gear change: **diesel throttle cuts** while the clutch dips (~0.15); motor stays on the pedal. Dip and lock-up use **`Shift fade`** (default 0.09). Leave `Clutch fade` for launch.

**Regen clutch:** off until diesel is in (below Diesel from gear). Then `Regen idle` (0.15) on the pedal; lift-off or brake → 1. Wire T → clutch → generator.

Telemetry: every 5 ticks the Lua script `GET`s `http://127.0.0.1:8787/t?...` (Stormworks only talks to **localhost on the game PC**). On the **game computer** run `npm run mc -- telem` (listens on all interfaces). From the other machine: `curl http://<game-lan-ip>:8787/latest`. Keys: `s` speed `f` filtered `v` set `i` throttle `h` hold `a` accel `e` err `g` gear `p` shift `c` clutch `m` motor `d` diesel thr `u` pull `k` cruise.

HUD: use a **3×1** monitor (96×32). Thin RPS, speed, **−** **+**, gear, **N**, mode, then fuel | battery.

**Touch:** HUD video → monitor, monitor composite → **Touch**.

- Speed: SET cruise (**P**). **−** / **+** = ±5 km/h. Tap speed again or brake = cancel. Regen clutch is off in **P**. Auto-shift still runs; throttle is cut for the clutch dip so it doesn’t dump.
- **N**: forced neutral — drive clutch open, motor off. Pedal still revs the diesel; regen clutch locks so it can charge. Tap N again to leave.

Wiring diagram: `/diesel-wiring.html`

## Gearboxes

MCU bits do not change. Set the **boxes** like this. Gear 1 = all off.

GB1/GB2 arrows **toward the engine** (through the drive clutch). GB3 arrows **toward the wheels**.

| Box | Arrows        | Off (MCU 0) | On (MCU 1) |
| --- | ------------- | ----------- | ---------- |
| GB1 | toward engine | 1:1         | 6:5        |
| GB2 | toward engine | 1:1         | 3:2        |
| GB3 | toward wheels | **3:1**     | 1:1        |

**GB3 reduction is the OFF ratio.** If you put 3:1 (or 5:2) on the ON side, gears 1–4 lose the reduction and 1st is 1:1.

3:1 off is the shortest legal first (wheels ÷3 → ×0.33). 4th→5th is a bigger step (0.60→1.00).

| Gear | GB1 | GB2 | GB3 | × engine |
| ---- | --- | --- | --- | -------- |
| 1    | off | off | off | 0.33     |
| 2    | on  | off | off | 0.40     |
| 3    | off | on  | off | 0.50     |
| 4    | on  | on  | off | 0.60     |
| 5    | off | off | on  | 1.00     |
| 6    | on  | off | on  | 1.20     |
| 7    | off | on  | on  | 1.50     |
| 8    | on  | on  | on  | 1.80     |

Optional **Reverse Box**: `-1:1` / `1:1`, driven by Reverse out.

## Pins

When this MCU needs more pins, grow it **wider**, not taller, and do not move existing pin cells: wiring in the vehicle depends on them. Block is **4×6** (grew wider). Left-face and top pins kept their cells. The old right column slid to x=3 so it stays the right face. New: Battery (0, 5), Physics (2, 0).

| Pin             | Wire                                       |
| --------------- | ------------------------------------------ |
| Ignition        | Seat key                                   |
| Seat            | Seat data composite (W/S = ch 2)           |
| Reverse         | Seat reverse                               |
| Engine RPS      | ECU — start/idle                           |
| Shaft RPS       | RPS sensor after the motor                 |
| Battery         | Battery charge 0..1                        |
| Physics         | Physics sensor composite                   |
| Fuel            | Tank litres                                |
| Touch           | Monitor composite (tap the HUD)            |
| Regen Clutch    | T → generator                              |
| Engine          | ECU run                                    |
| Engine Throttle | ECU throttle                               |
| Engine Clutch   | Engine → T (crank + from Diesel from gear) |
| Clutch          | Drive — T → gearbox                        |
| Starter Clutch  | T → motor (crank + drive)                  |
| Motor           | Starter, then pedal (holds through shifts) |
| Brakes          | Wheel brakes                               |
| Reverse Box     | Optional reverse gearbox                   |
| GB1–3           | The three boxes                            |
| HUD             | Video screen                               |
| Instruments     | ch 1 RPS, ch 2 gear                        |
