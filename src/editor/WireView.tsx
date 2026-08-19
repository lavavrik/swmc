/**
 * One wire: a polyline in its signal's colour with arrowheads along it.
 *
 * Each wire is drawn twice — a dark casing underneath and the coloured core on
 * top — so it stays legible against the teal workspace and against other wires
 * crossing it. Arrowheads get the same treatment.
 */
import { memo } from 'react'
import { signalColor } from '@/ui/signals'
import type { Point, SignalType } from '@/model/types'
import { wirePath } from './wireGeometry'

interface Props {
  from: Point
  to: Point
  signal: SignalType
  faded?: boolean
}

const ARROW = 'M -5 -5 L 6 0 L -5 5 Z'

/** Width of the coloured core, and of the casing behind it. */
export const WIRE_WIDTH = 4
export const WIRE_CASING_WIDTH = WIRE_WIDTH + 3

export const WireView = memo(function WireView({ from, to, signal, faded = false }: Props) {
  const path = wirePath(from, to)
  const colour = signalColor(signal)

  return (
    <g className="wire" opacity={faded ? 0.5 : 1} pointerEvents="none">
      <path
        className="wire-casing"
        d={path.d}
        fill="none"
        strokeWidth={WIRE_CASING_WIDTH}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <path
        d={path.d}
        fill="none"
        stroke={colour}
        strokeWidth={WIRE_WIDTH}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {path.arrows.map((arrow, i) => (
        <path
          key={i}
          className="wire-arrow"
          d={ARROW}
          fill={colour}
          transform={`translate(${arrow.x} ${arrow.y}) rotate(${(arrow.angle * 180) / Math.PI})`}
        />
      ))}
    </g>
  )
})
