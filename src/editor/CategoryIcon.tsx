/**
 * The glyph in the corner of a component's card.
 *
 * Each component has its own, drawn as stroked paths on a 24-unit grid so it
 * stays sharp at any zoom; the plate behind it is the light square the game
 * puts its icons on.
 */
import type { Category } from '@/library/types'
import type { ComponentTypeId } from '@/model/types'
import { GLYPH_SIZE, glyphFor } from './componentIcons'

interface Props {
  type: ComponentTypeId
  category: Category
  x: number
  y: number
  size: number
}

export function ComponentIcon({ type, category, x, y, size }: Props) {
  const glyph = glyphFor(type, category)
  const scale = size / GLYPH_SIZE
  // The glyph is inset a little, leaving the plate visible around it
  const inset = GLYPH_SIZE * 0.1

  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`} pointerEvents="none">
      <rect width={GLYPH_SIZE} height={GLYPH_SIZE} rx={3} fill="#dfe6e9" />
      <g
        transform={`translate(${inset} ${inset}) scale(${(GLYPH_SIZE - inset * 2) / GLYPH_SIZE})`}
        fill="none"
        stroke="#41504f"
        strokeWidth={1.9}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {glyph.stroke?.map((d, i) => (
          <path key={`s${i}`} d={d} />
        ))}
        {glyph.fill?.map((d, i) => (
          <path key={`f${i}`} d={d} fill="#41504f" stroke="none" />
        ))}
      </g>
    </g>
  )
}
