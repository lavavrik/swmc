/** Play, step, reset and the tick counter, in the bottom bar. */
import { useSimulationStore } from '@/sim/store'
import { TICKS_PER_SECOND } from '@/sim/engine'

export function SimulationControls() {
  const running = useSimulationStore((s) => s.running)
  const tick = useSimulationStore((s) => s.tick)
  const toggle = useSimulationStore((s) => s.toggle)
  const stepOnce = useSimulationStore((s) => s.stepOnce)
  const reset = useSimulationStore((s) => s.reset)

  return (
    <div className="sim-controls">
      <button
        className={`square-button${running ? ' active' : ''}`}
        title={running ? 'Pause the simulation' : 'Run the simulation'}
        onClick={toggle}
      >
        <svg width={16} height={16} viewBox="0 0 16 16" aria-hidden="true">
          {running ? (
            <path d="M4 3h3v10H4zM9 3h3v10H9z" fill="currentColor" />
          ) : (
            <path d="M4 3l9 5-9 5z" fill="currentColor" />
          )}
        </svg>
      </button>
      <button className="square-button" title="Advance one tick" onClick={stepOnce}>
        <svg width={16} height={16} viewBox="0 0 16 16" aria-hidden="true">
          <path d="M3 3l7 5-7 5zM11 3h2v10h-2z" fill="currentColor" />
        </svg>
      </button>
      <button className="square-button" title="Reset the simulation" onClick={reset}>
        <svg width={16} height={16} viewBox="0 0 16 16" aria-hidden="true">
          <path
            d="M13 8a5 5 0 1 1-1.5-3.5M12 2v3H9"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.6}
            strokeLinecap="round"
          />
        </svg>
      </button>
      <span className="sim-tick" title={`${TICKS_PER_SECOND} ticks per second`}>
        tick {tick}
      </span>
    </div>
  )
}
