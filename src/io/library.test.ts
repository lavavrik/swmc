import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { expect as unwrap } from '@/model/result'
import { addNode, createEmpty } from '@/model/ops'
import { librarySchema } from '@/library/registry'
import {
  deleteProject,
  listProjects,
  loadProject,
  projectId,
  saveProject,
  xmlFile,
} from './library'
import { serializeMicrocontroller } from './microcontroller'

const sample = (name: string) => {
  const doc = createEmpty({ name })
  return unwrap(addNode(librarySchema, doc, { type: 'arithmetic.add', position: { x: 0, y: 0 } }))
    .doc
}

beforeEach(async () => {
  for (const project of await listProjects()) await deleteProject(project.id)
})

describe('project library', () => {
  it('saves a project and lists it', async () => {
    await saveProject(sample('Autopilot'), 1000)
    const projects = await listProjects()
    expect(projects).toHaveLength(1)
    expect(projects[0]).toMatchObject({ name: 'Autopilot', description: '', componentCount: 1 })
  })

  it('keeps the description through save and load', async () => {
    const doc = sample('Autopilot')
    await saveProject({ ...doc, meta: { ...doc.meta, description: 'holds heading' } }, 1000)
    expect((await listProjects())[0]?.description).toBe('holds heading')
    const loaded = unwrap(await loadProject(projectId('Autopilot')))
    expect(loaded.meta.description).toBe('holds heading')
  })

  it('loads a saved project back as a document', async () => {
    await saveProject(sample('Autopilot'), 1000)
    const loaded = unwrap(await loadProject(projectId('Autopilot')))
    expect(loaded.meta.name).toBe('Autopilot')
    expect(loaded.nodes).toHaveLength(1)
  })

  it('replaces a project saved under the same name', async () => {
    await saveProject(sample('Autopilot'), 1000)
    await saveProject(sample('Autopilot'), 2000)
    const projects = await listProjects()
    expect(projects).toHaveLength(1)
    expect(projects[0]?.updatedAt).toBe(2000)
  })

  it('lists the most recently saved project first', async () => {
    await saveProject(sample('Older'), 1000)
    await saveProject(sample('Newer'), 2000)
    expect((await listProjects()).map((p) => p.name)).toEqual(['Newer', 'Older'])
  })

  it('deletes a project', async () => {
    await saveProject(sample('Autopilot'), 1000)
    await deleteProject(projectId('Autopilot'))
    expect(await listProjects()).toEqual([])
  })

  it('reports a load of something that is not there', async () => {
    expect((await loadProject('missing')).ok).toBe(false)
  })

  it('falls back to a usable id for a nameless project', () => {
    expect(projectId('')).toBe('untitled')
    expect(projectId('My Nice MC!')).toBe('my-nice-mc')
  })

  it('names an export file from the project id', () => {
    const file = xmlFile(sample('My Nice MC!'))
    expect(file.name).toBe('my-nice-mc.xml')
    expect(file.type).toBe('application/xml')
  })
})

describe('cloud library', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example')
    vi.stubEnv('VITE_API_TOKEN', 'secret')
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    fetchMock.mockReset()
  })

  it('saves by putting xml at the project id', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ id: 'autopilot', name: 'Autopilot', updatedAt: 9, componentCount: 1 }),
        { status: 200 },
      ),
    )
    const saved = await saveProject(sample('Autopilot'), 1000)
    expect(saved.updatedAt).toBe(9)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.example/microcontrollers/autopilot')
    expect(init.method).toBe('PUT')
    expect(String(init.body)).toContain('<microprocessor')
  })

  it('loads by parsing the xml the function returns', async () => {
    fetchMock.mockResolvedValue(
      new Response(serializeMicrocontroller(sample('Autopilot')), { status: 200 }),
    )
    const loaded = unwrap(await loadProject('autopilot'))
    expect(loaded.meta.name).toBe('Autopilot')
  })
})
