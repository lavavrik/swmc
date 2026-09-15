/**
 * Drag this onto a folder to save the microcontroller as `.xml`.
 * Click still downloads, for browsers that cannot drop a file out of the page.
 */
import { useEditorStore } from '@/editor/store'
import { exportFile, projectId, startXmlDrag } from '@/io/library'
import type { Microcontroller } from '@/model/types'

export function XmlDragHandle({
  doc,
  children,
}: {
  /** Defaults to the open microcontroller. Pass a copy when the save dialog has an unsaved name. */
  doc?: Microcontroller
  children?: string
}) {
  const live = useEditorStore((s) => s.doc)
  const source = doc ?? live
  const name = `${projectId(source.meta.name)}.xml`
  return (
    <button
      type="button"
      className="xml-drag"
      draggable
      title={`Drag ${name} onto a folder, or click to download`}
      onDragStart={(e) => startXmlDrag(e.dataTransfer, source)}
      onClick={() => exportFile(source)}
    >
      {children ?? name}
    </button>
  )
}
