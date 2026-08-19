/** The component menu: categorised, searchable, places into the centre of the view. */
import { useMemo, useState } from 'react'
import { componentsByCategory } from '@/library/registry'
import { useEditorStore } from '@/editor/store'
import { screenToWorld } from '@/editor/viewport'
import type { Category } from '@/library/types'

const CATEGORY_LABELS: Record<Category, string> = {
  arithmetic: 'Arithmetic',
  logic: 'Logic',
  comparison: 'Comparison',
  composite: 'Composite',
  video: 'Video',
  audio: 'Audio',
  data: 'Data',
  property: 'Properties',
  io: 'Microcontroller pins',
}

export function ComponentPicker({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('')
  const addNodeAt = useEditorStore((s) => s.addNodeAt)
  const viewport = useEditorStore((s) => s.viewport)

  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return componentsByCategory()
      .map((group) => ({
        ...group,
        components: group.components.filter(
          (c) => needle === '' || c.name.toLowerCase().includes(needle) || c.id.includes(needle),
        ),
      }))
      .filter((group) => group.components.length > 0)
  }, [query])

  const place = (type: string) => {
    // Drop the new component in the middle of whatever the user is looking at
    const canvas = document.querySelector('.canvas')?.getBoundingClientRect()
    const centre = screenToWorld(viewport, {
      x: (canvas?.width ?? window.innerWidth) / 2,
      y: (canvas?.height ?? window.innerHeight) / 2,
    })
    addNodeAt(type, centre)
    onClose()
  }

  return (
    <div className="picker-backdrop" onPointerDown={onClose}>
      <div className="picker" onPointerDown={(e) => e.stopPropagation()}>
        <input
          className="picker-search"
          autoFocus
          placeholder="Search components…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onClose()
          }}
        />
        <div className="picker-groups">
          {groups.map((group) => (
            <section key={group.category}>
              <h3>{CATEGORY_LABELS[group.category]}</h3>
              {group.components.map((component) => (
                <button
                  key={component.id}
                  className="picker-item"
                  title={component.description}
                  onClick={() => place(component.id)}
                >
                  <span className="picker-item-name">{component.name}</span>
                  <span className="picker-item-desc">{component.description}</span>
                </button>
              ))}
            </section>
          ))}
          {groups.length === 0 && <p className="picker-empty">No components match “{query}”.</p>}
        </div>
      </div>
    </div>
  )
}
