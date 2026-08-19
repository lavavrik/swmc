/**
 * The project library: saved microcontrollers, held in IndexedDB.
 *
 * Documents are stored as their XML so that what the library holds is exactly
 * what the game would load — there is no second serialization format to keep in
 * step, and an export is a straight copy of the stored text.
 */
import type { Microcontroller } from '@/model/types'
import { err, type Result } from '@/model/result'
import { parseMicrocontroller, serializeMicrocontroller } from './microcontroller'

const DATABASE = 'swmc'
const STORE = 'projects'
const VERSION = 1

export interface ProjectSummary {
  readonly id: string
  readonly name: string
  /** Milliseconds since the epoch. */
  readonly updatedAt: number
  readonly componentCount: number
}

export interface StoredProject extends ProjectSummary {
  readonly xml: string
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('could not open the project library'))
  })
}

function transact<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDatabase().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const request = run(db.transaction(STORE, mode).objectStore(STORE))
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error ?? new Error('project library request failed'))
      }),
  )
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
  const all = await transact<StoredProject[]>('readonly', (store) => store.getAll())
  return all
    .map(({ id, name, updatedAt, componentCount }) => ({ id, name, updatedAt, componentCount }))
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function saveProject(doc: Microcontroller, now: number): Promise<StoredProject> {
  const project: StoredProject = {
    id: projectId(doc.meta.name),
    name: doc.meta.name,
    updatedAt: now,
    componentCount: doc.nodes.length,
    xml: serializeMicrocontroller(doc),
  }
  await transact('readwrite', (store) => store.put(project))
  return project
}

export async function loadProject(id: string): Promise<Result<Microcontroller>> {
  const project = await transact<StoredProject | undefined>('readonly', (store) => store.get(id))
  if (!project) return err(`no saved project called ${id}`)
  return parseMicrocontroller(project.xml)
}

export async function deleteProject(id: string): Promise<void> {
  await transact('readwrite', (store) => store.delete(id))
}

/** Reads an imported file and parses it. */
export async function importFile(file: File): Promise<Result<Microcontroller>> {
  const text = await file.text()
  return parseMicrocontroller(text)
}

/** Offers the document to the user as an `.xml` download. */
export function exportFile(doc: Microcontroller): void {
  const blob = new Blob([serializeMicrocontroller(doc)], { type: 'application/xml' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${projectId(doc.meta.name)}.xml`
  link.click()
  URL.revokeObjectURL(url)
}
