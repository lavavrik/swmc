/**
 * Toolbar glyphs, drawn as paths on a 24x24 grid so they stay crisp inside the
 * round buttons. Shapes follow the in-game toolbar icons.
 */
export type IconName =
  | 'close'
  | 'confirm'
  | 'new'
  | 'open'
  | 'save'
  | 'gamefiles'
  | 'preview3d'
  | 'tooltips'
  | 'undo'
  | 'redo'
  | 'copy'
  | 'cut'
  | 'paste'
  | 'plus'
  | 'minus'
  | 'components'
  | 'pins'

const PATHS: Record<IconName, string> = {
  close: 'M7 7l10 10M17 7L7 17',
  confirm: 'M6 9l6 7 6-7',
  new: 'M12 6v12M6 12h12',
  open: 'M3 7h6l2 2h10v9H3z',
  save: 'M4 4h13l3 3v13H4zM8 4v6h8V4M8 14h8v6H8z',
  gamefiles: 'M3 7h6l2 2h10v9H3zM8 13h8M12 11v4',
  preview3d: 'M12 3l8 4.5v9L12 21l-8-4.5v-9zM12 3v18M4 7.5l8 4.5 8-4.5',
  tooltips: 'M9 20h6M10 17h4a5 5 0 1 0-4 0z',
  undo: 'M9 8H5V4M5 8a8 8 0 1 1-1 6',
  redo: 'M15 8h4V4M19 8a8 8 0 1 0 1 6',
  copy: 'M8 8h11v12H8zM5 4h11v3M5 4v12h3',
  cut: 'M6 4l12 14M18 4L6 18M7 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm10 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  paste: 'M7 5h10v15H7zM10 3h4v3h-4z',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  components: 'M12 3l8 4.5v9L12 21l-8-4.5v-9zM12 12l8-4.5M12 12v9M12 12L4 7.5',
  pins: 'M6 5h12v14H6zM3 8h3M3 12h3M3 16h3M18 8h3M18 12h3M18 16h3',
}

export function Icon({ name, size = 24 }: { name: IconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d={PATHS[name]}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
