import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { expect as unwrap } from '@/model/result'
import { addNode, createEmpty } from '@/model/ops'
import { librarySchema } from '@/library/registry'
import { deleteProject, listProjects, loadProject, projectId, saveProject } from './library'

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
    expect(projects[0]).toMatchObject({ name: 'Autopilot', componentCount: 1 })
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
})
