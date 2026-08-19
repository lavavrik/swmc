/**
 * The small dark glyph in a card's top-left corner.
 *
 * The game uses a bespoke icon per component; these are simple category-level
 * stand-ins drawn as paths so they scale with the canvas and cost one element.
 */
import type { Category } from '@/library/types'

const GLYPHS: Record<Category, string> = {
  arithmetic: 'M2 7h10M7 2v10',
  logic: 'M3 2h4a5 5 0 0 1 0 10H3z',
  comparison: 'M3 4h8M3 9h8',
  composite: 'M2 3h4v4H2zM8 7h4v4H8z',
  video: 'M2 3h10v8H2zM5 5l4 2-4 2z',
  audio: 'M3 5v4h2l3 3V2L5 5z',
  data: 'M2 3h10v8H2zM2 6h10',
  property: 'M3 3h8v3H3zM3 8h8v3H3z',
  io: 'M2 7h6m0 0-2-2m2 2-2 2M10 3v8',
}

export function CategoryIcon({ category, x, y }: { category: Category; x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`} pointerEvents="none">
      <rect width={14} height={14} rx={2} fill="#e7ecee" />
      <path
        d={GLYPHS[category]}
        transform="translate(0.5 0.5) scale(0.95)"
        fill="none"
        stroke="#59666c"
        strokeWidth={1.4}
        strokeLinecap="round"
      />
    </g>
  )
}
