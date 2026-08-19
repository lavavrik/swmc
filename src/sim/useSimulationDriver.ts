/**
 * Drives the engine from the browser's frame loop.
 *
 * A fixed-step accumulator keeps the tick count honest when frames are dropped:
 * the simulation always advances 60 ticks per second of wall clock, however
 * often the browser paints. A long pause (a background tab) is capped rather
 * than replayed, which is what the game does too.
 */
import { useEffect } from 'react'
import { useEditorStore } from '@/editor/store'
import { DISPLAY_INTERVAL, TICKS_PER_SECOND, useSimulationStore } from './store'

/** Never advance more than this many ticks in one frame. */
const MAX_CATCH_UP_TICKS = 10

export function useSimulationDriver(): void {
  // Keep the engine pointed at the current document
  useEffect(
    () =>
      useEditorStore.subscribe((state, previous) => {
        if (state.doc !== previous.doc) useSimulationStore.getState().useDocument(state.doc)
      }),
    [],
  )

  useEffect(() => {
    useSimulationStore.getState().useDocument(useEditorStore.getState().doc)
  }, [])

  useEffect(() => {
    let frame = 0
    let last = performance.now()
    let carry = 0
    let sinceDisplay = 0

    const loop = (now: number) => {
      frame = requestAnimationFrame(loop)
      const store = useSimulationStore.getState()
      if (!store.running) {
        last = now
        return
      }

      carry += (now - last) / 1000
      last = now
      const due = Math.min(Math.floor(carry * TICKS_PER_SECOND), MAX_CATCH_UP_TICKS)
      if (due <= 0) return
      carry -= due / TICKS_PER_SECOND

      for (let i = 0; i < due; i++) store.advance()
      sinceDisplay += due
      if (sinceDisplay >= DISPLAY_INTERVAL) {
        sinceDisplay = 0
        store.refresh()
      }
    }

    frame = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(frame)
  }, [])
}
