import { useSyncExternalStore, useMemo, useCallback } from 'react'
import { CancelFlowMachine } from '../core/machine'
import type { FlowConfig } from '../core/types'

export function useCancelFlow(config: FlowConfig) {
  const machine = useMemo(
    () => new CancelFlowMachine(config),
    // Recreate only when session token changes.
    // For local mode, the machine is created once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [config.session],
  )

  const subscribe = useCallback(
    (cb: () => void) => machine.subscribe(cb),
    [machine],
  )

  const getSnapshot = useCallback(
    () => machine.snapshot,
    [machine],
  )

  const state = useSyncExternalStore(subscribe, getSnapshot)

  return {
    // State
    ...state,

    // Computed
    reasons: machine.reasons,
    stepIndex: machine.stepIndex,
    totalSteps: machine.totalSteps,

    // Actions
    selectReason: machine.selectReason.bind(machine),
    setFeedback: machine.setFeedback.bind(machine),
    accept: machine.accept.bind(machine),
    decline: machine.decline.bind(machine),
    cancel: machine.cancel.bind(machine),
    next: machine.next.bind(machine),
    back: machine.back.bind(machine),
    close: machine.close.bind(machine),
  }
}
