import { useCallback, useState } from 'react'

const LIMIT = 100

/**
 * Undo / redo over one value. `set(next, false)` changes it without a history step (during a drag; call
 * `checkpoint()` when the drag starts so the whole drag undoes in one step).
 */
export function useUndo<T>(initial: T) {
  const [state, setState] = useState({ past: [] as T[], present: initial, future: [] as T[] })
  const set = useCallback((next: T | ((v: T) => T), record = true) => {
    setState((s) => {
      const value = typeof next === 'function' ? (next as (v: T) => T)(s.present) : next
      if (value === s.present) return s
      return record
        ? { past: [...s.past, s.present].slice(-LIMIT), present: value, future: [] }
        : { ...s, present: value }
    })
  }, [])
  const checkpoint = useCallback(
    () => setState((s) => ({ past: [...s.past, s.present].slice(-LIMIT), present: s.present, future: [] })),
    [],
  )
  const undo = useCallback(
    () =>
      setState((s) =>
        s.past.length
          ? { past: s.past.slice(0, -1), present: s.past[s.past.length - 1], future: [s.present, ...s.future] }
          : s,
      ),
    [],
  )
  const redo = useCallback(
    () =>
      setState((s) =>
        s.future.length ? { past: [...s.past, s.present], present: s.future[0], future: s.future.slice(1) } : s,
      ),
    [],
  )
  const reset = useCallback((v: T) => setState({ past: [], present: v, future: [] }), [])
  return {
    value: state.present,
    set,
    checkpoint,
    undo,
    redo,
    reset,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
  }
}
