# Hybrid Full — vehicle wiring

MCU recipe: `recipes/hybrid-full.yaml`  
XML: `microcontrollers/hybrid-full.xml`  
Drawn schematic: open `/hybrid-full-wiring.html` while `npm run dev` is running.

Clutches are **number 0..1**. Gearboxes are **on/off**. Never lock the diesel to the wheels while cranking.

Pipes are universal. The same pipe blocks carry **RPS / torque** and **fluid**. A cross can carry both. Clutches and gearboxes pass RPS, not fluid.

| Overlay | What | How |
| --- | --- | --- |
| Pipes (RPS) | Engine, clutches, motor, GB1–3, wheels, generators | Pipe tool. T-junctions to branch. |
| Pipes (fluid) | Fuel, air, exhaust, coolant | Same pipe tool. Not through a clutch/gearbox. |
| Electric | Battery → MCU, motors, gearboxes, ECU, generators | Yellow electric network. |
| Logic | Seat + sensors + MCU outputs | Coloured data nodes. |

## Shaft (RPS pipes)

Two pipes. The diesel genset must **not** go through the starter clutch or the motor.

```
ENGINE ──pipe──┬── Engine Gen clutch ── Generator     ← charge, independent
               └── Starter clutch ── MOTOR ── Drive clutch ── GB1 ── GB2 ── GB3 ── WHEELS
                                                              │
                                                         Regen clutch ── Generator
```

If the generator is behind the starter clutch, opening that clutch at rest kills charge. T-off the generator from the **engine**.

Electric motors run about **20 RPS** at throttle 1. Pipe the diesel 1:1 onto the motor shaft (starter clutch locked while driving) so it always helps the wheels. Gearboxes sit after the motor.

GB1 first after the motor, arrows **toward motors**, off `1:1` on `6:5`.  
GB2 second, arrows **toward motors**, off `1:1` on `3:2`.  
GB3 last before the wheels, arrows **away from motors**, off `2:1` on `1:1`.

Cranking (engine RPS is 0): Engine Clutch `1`, Drive Clutch `0`, Motor = Starter throttle.  
Once RPS > 0 the ECU owns idle — Engine Clutch opens. Drive Clutch only for throttle or reverse. Ignition alone does not roll the car.

## MCU pins

Red = on/off. Green = number.

| Pin | Dir | Wire to |
| --- | --- | --- |
| Ignition | in | Seat key |
| Seat | in | Seat **Seat data** composite. Number ch 2 is W/S: W = throttle, S = brake |
| Reverse | in | Seat reverse |
| EV mode | in | Toggle (engine off unless battery low or charge hold) |
| Charge hold | in | Motors off. Diesel + regen only. |
| Engine RPS | in | Engine controller RPS |
| Battery | in | Battery charge `0..1` |
| Wheel RPS | in | Wheel or propshaft RPS (shift) |
| Physics | in | Physics sensor composite. Number **ch 13** = abs linear speed m/s |
| Engine | out | Engine controller run |
| Engine Throttle | out | Engine controller load `0..1` |
| Starter Clutch | out | Engine ↔ motor, cranking only. Opens at Start RPS. |
| Drive Clutch | out | Clutch motor → wheels |
| Engine Gen | out | Engine → generator. Pipe off the engine, not through the starter clutch. |
| Regen Clutch | out | Clutch transmission → generator (brake at speed if battery not full) |
| Wheel Brakes | out | Friction 0..1. All of the pedal when slow or battery full; fades out as regen takes over |
| Motor | out | Electric motor throttle |
| Motor Reverse | out | Electric motor reverse |
| Gearbox 1..3 | out | The three boxes, in shaft order |
| Instruments | out | Composite to dials: **ch 1** engine RPS, **ch 2** speed m/s, **ch 3** battery, **ch 4** gear 1–8 |

Properties on the block: Charge throttle, Starter throttle, Idle RPS, SOC cut/low/generate/full, RPS per gear.

The engine is an **external controller** (on/off + throttle). The motor cranks it through **Starter Clutch**, then that clutch opens. Charging is **Engine Gen** on the engine, independent of the motor.

Fuel, air, exhaust and coolant are **fluid** in those same pipes. Do not route fluid through a clutch or gearbox.
