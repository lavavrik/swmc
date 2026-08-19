/** One wire: a polyline in its signal's colour with arrowheads along it. */
import { memo } from 'react'
import { signalColor } from '@/ui/signals'
import type { SignalType } from '@/model/types'
import type { Point } from '@/model/types'
import { wirePath } from './wireGeometry'

interface Props {
  from: Point
  to: Point
  signal: SignalType
  faded?: boolean
}

const ARROW = 'M -5 -4.5 L 5 0 L -5 4.5 Z'

export const WireView = memo(function WireView({ from, to, signal, faded = false }: Props) {
  const path = wirePath(from, to)
  const colour = signalColor(signal)
  return (
    <g className="wire" opacity={faded ? 0.45 : 1} pointerEvents="none">
      <path d={path.d} fill="none" stroke={colour} strokeWidth={3} strokeLinejoin="round" />
      {path.arrows.map((arrow, i) => (
        <path
          key={i}
          d={ARROW}
          fill={colour}
          transform={`translate(${arrow.x} ${arrow.y}) rotate(${(arrow.angle * 180) / Math.PI})`}
        />
      ))}
    </g>
  )
})
