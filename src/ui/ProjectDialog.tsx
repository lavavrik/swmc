/**
 * Opening and saving microcontrollers.
 *
 * The same dialog covers the library (IndexedDB) and the game's own `.xml`
 * files, because to the user they are the same task.
 */
import { useCallback, useEffect, useState } from 'react'
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
import { findDesigns, type FoundDesign } from '@/io/gameFiles'
import { parseMicrocontroller } from '@/io/microcontroller'
import { useGameFilesStore } from './gameFilesStore'

export type ProjectDialogMode = 'open' | 'save'

const formatDate = (ms: number) => new Date(ms).toLocaleString()

export function ProjectDialog({ mode, onClose }: { mode: ProjectDialogMode; onClose: () => void }) {
  const doc = useEditorStore((s) => s.doc)
  const load = useEditorStore((s) => s.load)
  const setMeta = useEditorStore((s) => s.setMeta)

  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [designs, setDesigns] = useState<FoundDesign[] | null>(null)
  const designsFolder = useGameFilesStore((s) => s.designs)
  const [name, setName] = useState(doc.meta.name)
  const [problem, setProblem] = useState<string | null>(null)
  const [dropping, setDropping] = useState(false)

  const refresh = useCallback(() => {
    listProjects().then(setProjects, (error: unknown) => setProblem(String(error)))
  }, [])

  useEffect(refresh, [refresh])

  // Whatever the player's own folder holds, if they have pointed us at one
  useEffect(() => {
    if (mode !== 'open' || !designsFolder) return
    findDesigns(designsFolder.folder).then(setDesigns, (error: unknown) =>
      setProblem(String(error)),
    )
  }, [mode, designsFolder])

  const openDesign = async (design: FoundDesign) => {
    const text = await (await design.handle.getFile()).text()
    const result = parseMicrocontroller(text)
    if (!result.ok) {
      setProblem(`${design.file}: ${result.error}`)
      return
    }
    load(result.value)
    onClose()
  }

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
          <div
            className={`dialog-drop${dropping ? ' active' : ''}`}
            onDragOver={(e) => {
              e.preventDefault()
              setDropping(true)
            }}
            onDragLeave={() => setDropping(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDropping(false)
              void importChosenFile(e.dataTransfer.files[0])
            }}
          >
            {/*
              A label rather than a button calling `input.click()`: Safari and
              Firefox refuse to open the picker for a hidden input driven from
              script, but they honour a label every time.
            */}
            <label className="text-button primary">
              Choose a .xml file…
              <input
                type="file"
                accept=".xml,application/xml"
                className="visually-hidden"
                onChange={(e) => void importChosenFile(e.target.files?.[0])}
              />
            </label>
            <span>or drop one here</span>
          </div>
        )}

        <div className="picker-groups">
          {mode === 'open' && designsFolder && (
            <>
              <h3>In {designsFolder.name}</h3>
              {designs === null && <p className="picker-empty">Looking…</p>}
              {designs?.length === 0 && (
                <p className="picker-empty">Nothing that looks like a microcontroller.</p>
              )}
              {designs?.map((design) => (
                <button
                  key={`${design.where}/${design.file}`}
                  className="picker-item"
                  onClick={() => void openDesign(design)}
                >
                  <span className="picker-item-name">{design.file}</span>
                  <span className="picker-item-desc">{design.where || designsFolder.name}</span>
                </button>
              ))}
            </>
          )}

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
