/**
 * The project library: saved microcontrollers.
 *
 * Documents are stored as their XML so that what the library holds is exactly
 * what the game would load — there is no second serialization format to keep in
 * step, and an export is a straight copy of the stored text.
 *
 * By default that store is IndexedDB, in this browser. When the build is
 * pointed at the cloudhost function (`VITE_API_BASE_URL`), the same functions
 * talk to that instead — one library, still XML.
 */
import type { Microcontroller } from '@/model/types'
import { err, type Result } from '@/model/result'
import { cloudLibrary } from './config'
import { PROJECTS, transact } from './database'
import { parseMicrocontroller, serializeMicrocontroller } from './microcontroller'
import { deleteRemote, getRemote, listRemote, putRemote } from './remote'

export interface ProjectSummary {
  readonly id: string
  readonly name: string
  readonly description: string
  /** Milliseconds since the epoch. */
  readonly updatedAt: number
  readonly componentCount: number
}

export interface StoredProject extends ProjectSummary {
  readonly xml: string
}

/** Ids are derived from the name so saving the same project twice replaces it. */
export function projectId(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return slug.length > 0 ? slug : 'untitled'
}

export async function listProjects(): Promise<ProjectSummary[]> {
  if (cloudLibrary()) {
    return (await listRemote()).map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description ?? '',
      updatedAt: p.updatedAt,
      componentCount: p.componentCount,
    }))
  }
  const all = await transact<StoredProject[]>(PROJECTS, 'readonly', (store) => store.getAll())
  return all
    .map(({ id, name, description = '', updatedAt, componentCount }) => ({
      id,
      name,
      description,
      updatedAt,
      componentCount,
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function saveProject(doc: Microcontroller, now: number): Promise<StoredProject> {
  const xml = serializeMicrocontroller(doc, { minifyLua: false })
  const project: StoredProject = {
    id: projectId(doc.meta.name),
    name: doc.meta.name,
    description: doc.meta.description,
    updatedAt: now,
    componentCount: doc.nodes.length,
    xml,
  }
  if (cloudLibrary()) {
    const saved = await putRemote(project.id, xml)
    return {
      ...project,
      updatedAt: saved.updatedAt,
      name: saved.name,
      description: saved.description ?? project.description,
      componentCount: saved.componentCount,
    }
  }
  await transact(PROJECTS, 'readwrite', (store) => store.put(project))
  return project
}

export async function loadProject(id: string): Promise<Result<Microcontroller>> {
  if (cloudLibrary()) {
    const xml = await getRemote(id)
    if (xml === null) return err(`no saved project called ${id}`)
    return parseMicrocontroller(xml)
  }
  const project = await transact<StoredProject | undefined>(PROJECTS, 'readonly', (store) =>
    store.get(id),
  )
  if (!project) return err(`no saved project called ${id}`)
  return parseMicrocontroller(project.xml)
}

export async function deleteProject(id: string): Promise<void> {
  if (cloudLibrary()) {
    await deleteRemote(id)
    return
  }
  await transact(PROJECTS, 'readwrite', (store) => store.delete(id))
}

/** Reads an imported file and parses it. */
export async function importFile(file: File): Promise<Result<Microcontroller>> {
  const text = await file.text()
  return parseMicrocontroller(text)
}

/** Game-loadable XML as a named file, for download or a drag onto a folder. */
export function xmlFile(doc: Microcontroller): File {
  return new File([serializeMicrocontroller(doc)], `${projectId(doc.meta.name)}.xml`, {
    type: 'application/xml',
  })
}

/** Offers the document to the user as an `.xml` download. */
export function exportFile(doc: Microcontroller): void {
  const file = xmlFile(doc)
  const url = URL.createObjectURL(file)
  const link = document.createElement('a')
  link.href = url
  link.download = file.name
  link.click()
  URL.revokeObjectURL(url)
}

/**
 * Puts the microcontroller on a drag so Chromium can drop it onto a folder.
 * `DownloadURL` is a Chrome/Edge type; other browsers keep click-to-download.
 */
export function startXmlDrag(transfer: DataTransfer, doc: Microcontroller): void {
  const file = xmlFile(doc)
  const url = URL.createObjectURL(file)
  transfer.effectAllowed = 'copy'
  transfer.setData('DownloadURL', `application/xml:${file.name}:${url}`)
  transfer.setData('text/uri-list', url)
  transfer.setData('text/plain', file.name)
  try {
    transfer.items.add(file)
  } catch {
    // Some browsers only accept strings on the drag store
  }
  const done = () => URL.revokeObjectURL(url)
  window.addEventListener('dragend', done, { once: true })
}
