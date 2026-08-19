/**
 * Editor key bindings. Follows the in-game bindings where they exist and
 * platform convention where they do not.
 */
import { useEffect } from 'react'
import { useEditorStore } from '@/editor/store'

/** Typing in a field should never trigger an editor shortcut. */
function isTextEntry(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  )
}

/**
 * @param viewSize measures the workspace when a shortcut needs it. Measuring on
 * demand rather than tracking it in state means framing is never computed
 * against a size the window has already grown out of.
 */
export function useKeyboardShortcuts(viewSize: () => { width: number; height: number }) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTextEntry(e.target)) return
      const store = useEditorStore.getState()
      const mod = e.ctrlKey || e.metaKey

      if (e.key === 'Escape') {
        store.dispatch({ type: 'escape' })
        return
      }
      if (!mod && (e.key === 'Delete' || e.key === 'Backspace')) {
        e.preventDefault()
        store.deleteSelection()
        return
      }
      if (!mod && (e.key === 'f' || e.key === 'F')) {
        store.zoomToFit(viewSize())
        return
      }
      if (!mod) return

      switch (e.key.toLowerCase()) {
        case 'z':
          e.preventDefault()
          if (e.shiftKey) store.redo()
          else store.undo()
          break
        case 'y':
          e.preventDefault()
          store.redo()
          break
        case 'c':
          store.copy()
          break
        case 'x':
          store.cut()
          break
        case 'v':
          store.paste()
          break
        case 'd':
          e.preventDefault()
          store.duplicateSelection()
          break
        case 'a':
          e.preventDefault()
          store.selectAll()
          break
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [viewSize])
}
