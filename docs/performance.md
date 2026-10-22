# Performance notes

## Idle CPU: the wire arrow march (SWMC-4, 2026-10)

An idle editor (simulation paused, nothing touched) used ~20% of a 9800X3D in
Chrome's task manager.

**Cause.** Every wire's arrowheads march along it with an infinite CSS
animation (`.wire-flow` in `src/editor/canvas.css`). The animated elements are
SVG children, and Chrome does not composite SVG transforms: each animation
frame re-runs style and repaints the canvas. With a `linear` timing function
that is every display refresh.

**How it was measured.** `diesel` open in the dev server, renderer process CPU
sampled with `top -pid <renderer>` while overriding the animation from the
console:

| Variant                        | Renderer CPU |
| ------------------------------ | ------------ |
| `linear` (original)            | 20–50%       |
| animation off                  | 0%           |
| `.node-card` drop-shadow off   | no change    |
| `steps(96)` — 60 fps           | ~10%         |
| `steps(32)` — 20 fps (shipped) | ~1%          |
| `steps(16)` — 10 fps           | ~1%          |

The frame loops (`useSimulationDriver`, `ScreenPreview`) run every frame but
return early when paused; they measured as 0% once the animation was off.

**Rule.** Do not add continuous `linear` animations to SVG in the canvas. If
something must move, step it (`steps(n)`) at a low frame rate, or move it to a
composited HTML layer.
