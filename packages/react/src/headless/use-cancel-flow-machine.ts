// Internal — shared by `useCancelFlow` (headless) and the `CancelFlow`
// component. Lives under headless/ since it's the headless layer of the
// SDK; the component imports it because there's no separate public/private
// split worth maintaining for one shared file.

import { useCallback, useEffect, useRef, useState } from 'react'
import { ChurnkeyApi } from '../core/api'
import { CancelFlowMachine } from '../core/machine'
import { decodeSessionToken } from '../core/token'
import type { FlowCallbacks, FlowConfig, FlowState } from '../core/types'

const HANDLER_NAMES = [
  'handleDiscount',
  'handlePause',
  'handlePlanChange',
  'handleTrialExtension',
  'handleRebate',
  'handleCancel',
] as const satisfies readonly (keyof FlowCallbacks)[]

export interface CancelFlowMachineHandle {
  machine: CancelFlowMachine
  state: FlowState
  isLoading: boolean
  loadError: Error | null
  /** Re-fetch the flow config (token mode only). No-op without a session. */
  retry: () => void
}

/**
 * Wires a CancelFlowMachine to React lifecycle. Used internally by both the
 * `CancelFlow` component and the `useCancelFlow` hook — not part of the
 * public API.
 *
 * Callbacks reach the machine through a ref updated each render: listeners as
 * thunks that dereference it, `handle*` as getters on it, so the machine still
 * sees whether a handler is passed. This buys two things: the consumer's
 * latest closure always runs, and the fetch effect's dep list stays stable so
 * inline-arrow handlers don't trigger a re-fetch and reset the flow to step 1.
 */
export function useCancelFlowMachine(config: FlowConfig): CancelFlowMachineHandle {
  // FlowConfig extends FlowCallbacks, so storing the whole config gives us
  // access to every callback by name without a separate copy.
  const callbacksRef = useRef(config)
  callbacksRef.current = config

  const [machine] = useState(() => {
    const cb = callbacksRef
    const dispatch: FlowCallbacks = {
      onAccept: (o, c) => cb.current.onAccept?.(o, c),
      onDiscount: (o, c) => cb.current.onDiscount?.(o, c),
      onPause: (o, c) => cb.current.onPause?.(o, c),
      onPlanChange: (o, c) => cb.current.onPlanChange?.(o, c),
      onTrialExtension: (o, c) => cb.current.onTrialExtension?.(o, c),
      onRebate: (o, c) => cb.current.onRebate?.(o, c),
      onCancel: (c) => cb.current.onCancel?.(c),
      onClose: () => cb.current.onClose?.(),
      onStepChange: (step, prevStep) => cb.current.onStepChange?.(step, prevStep),
    }
    const machineConfig: FlowConfig = { ...config, ...dispatch }
    // A handler replaces Churnkey's own server action, so the machine has to see whether the
    // consumer passes one, not a wrapper that always exists.
    for (const name of HANDLER_NAMES) {
      Object.defineProperty(machineConfig, name, { get: () => cb.current[name], enumerable: true })
    }
    return new CancelFlowMachine(machineConfig)
  })

  const [state, setState] = useState<FlowState>(() => machine.getSnapshot())
  const [isLoading, setIsLoading] = useState(!!config.session)
  const [loadError, setLoadError] = useState<Error | null>(null)

  useEffect(() => {
    setState(machine.getSnapshot())
    return machine.subscribe(() => setState(machine.getSnapshot()))
  }, [machine])

  const loadConfig = useCallback(() => {
    if (!config.session) return
    setLoadError(null)
    setIsLoading(true)
    let cancelled = false
    const creds = decodeSessionToken(config.session)
    const api = new ChurnkeyApi(creds, config.apiBaseUrl)
    api
      // Read through the ref, not the closure: an inline `customerAttributes`
      // object literal would otherwise join the dep list and re-fetch (and
      // reset the flow) on every render.
      .fetchConfig(callbacksRef.current.customerAttributes)
      .then((sdkConfig) => {
        if (cancelled) return
        machine.initializeFromConfig(sdkConfig, api, creds)
        setIsLoading(false)
      })
      .catch((err) => {
        if (cancelled) return
        setLoadError(err instanceof Error ? err : new Error(String(err)))
        setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [config.session, config.apiBaseUrl, machine])

  useEffect(() => {
    if (!config.session) return
    return loadConfig()
  }, [config.session, loadConfig])

  return { machine, state, isLoading, loadError, retry: loadConfig }
}
