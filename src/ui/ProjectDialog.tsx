/**
 * Opening and saving microcontrollers.
 *
 * The same dialog covers the library (IndexedDB) and the game's own `.xml`
 * files, because to the user they are the same task.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useEditorStore } from '@/editor/store'
import {
  deleteProject,
  exportFile,
  importFile,
  listProjects,
  loadProject,
  saveProject,
  type ProjectSummary,
} from '@/io/library'

export type ProjectDialogMode = 'open' | 'save'

const formatDate = (ms: number) => new Date(ms).toLocaleString()

export function ProjectDialog({ mode, onClose }: { mode: ProjectDialogMode; onClose: () => void }) {
  const doc = useEditorStore((s) => s.doc)
  const load = useEditorStore((s) => s.load)
  const setMeta = useEditorStore((s) => s.setMeta)

  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [name, setName] = useState(doc.meta.name)
  const [problem, setProblem] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const refresh = useCallback(() => {
    listProjects().then(setProjects, (error: unknown) => setProblem(String(error)))
  }, [])

  useEffect(refresh, [refresh])

  const open = async (id: string) => {
    const result = await loadProject(id)
    if (!result.ok) {
      setProblem(result.error)
      return
    }
    load(result.value)
    onClose()
  }

  const importChosenFile = async (file: File | undefined) => {
    if (!file) return
    const result = await importFile(file)
    if (!result.ok) {
      setProblem(result.error)
      return
    }
    load(result.value)
    onClose()
  }

  const save = async () => {
    setMeta({ name })
    try {
      await saveProject({ ...doc, meta: { ...doc.meta, name } }, Date.now())
      onClose()
    } catch (error) {
      setProblem(String(error))
    }
  }

  return (
    <div className="picker-backdrop" onPointerDown={onClose}>
      <div className="picker dialog" onPointerDown={(e) => e.stopPropagation()}>
        <header className="dialog-header">
          <h2>{mode === 'open' ? 'Open microcontroller' : 'Save microcontroller'}</h2>
        </header>

        {mode === 'save' && (
          <div className="dialog-row">
            <label>
              <span>Name</span>
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void save()
                }}
              />
            </label>
            <button className="text-button primary" onClick={() => void save()}>
              Save to library
            </button>
            <button
              className="text-button"
              onClick={() => exportFile({ ...doc, meta: { ...doc.meta, name } })}
            >
              Export .xml
            </button>
          </div>
        )}

        {mode === 'open' && (
          <div className="dialog-row">
            <button className="text-button primary" onClick={() => fileRef.current?.click()}>
              Import .xml file…
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".xml,application/xml"
              hidden
              onChange={(e) => void importChosenFile(e.target.files?.[0])}
            />
          </div>
        )}

        <div className="picker-groups">
          <h3>Library</h3>
          {projects.length === 0 && <p className="picker-empty">Nothing saved yet.</p>}
          {projects.map((project) => (
            <div key={project.id} className="project-row">
              <button className="picker-item" onClick={() => void open(project.id)}>
                <span className="picker-item-name">{project.name}</span>
                <span className="picker-item-desc">
                  {project.componentCount} components · {formatDate(project.updatedAt)}
                </span>
              </button>
              <button
                className="text-button"
                title={`Delete ${project.name}`}
                onClick={() => void deleteProject(project.id).then(refresh)}
              >
                Delete
              </button>
            </div>
          ))}
        </div>

        {problem && <p className="dialog-problem">{problem}</p>}
      </div>
    </div>
  )
}
