import { describe, expect, it } from 'vitest'
import { HISTORY_LIMIT, emptyHistory, push, redo, undo } from './history'

describe('history', () => {
  it('undoes and redoes an edit', () => {
    const h = push(emptyHistory<string>(), 'a', 'edit')
    const undone = undo(h, 'b', 'edit')
    expect(undone?.value).toBe('a')
    const redone = redo(undone!.history, 'a', 'edit')
    expect(redone?.value).toBe('b')
  })

  it('returns null when there is nothing to undo or redo', () => {
    expect(undo(emptyHistory<string>(), 'a', 'x')).toBeNull()
    expect(redo(emptyHistory<string>(), 'a', 'x')).toBeNull()
  })

  it('clears the redo stack on a fresh edit', () => {
    const h = push(emptyHistory<string>(), 'a', 'edit')
    const undone = undo(h, 'b', 'edit')!
    expect(push(undone.history, 'a', 'edit').future).toEqual([])
  })

  it('coalesces consecutive edits with the same label', () => {
    let h = push(emptyHistory<string>(), 'a', 'property')
    h = push(h, 'b', 'property', true)
    h = push(h, 'c', 'property', true)
    expect(h.past).toHaveLength(1)
    expect(undo(h, 'd', 'property')?.value).toBe('a')
  })

  it('bounds the stack', () => {
    let h = emptyHistory<number>()
    for (let i = 0; i < HISTORY_LIMIT + 50; i++) h = push(h, i, `edit${i}`)
    expect(h.past).toHaveLength(HISTORY_LIMIT)
    expect(h.past[0]?.value).toBe(50)
  })
})
