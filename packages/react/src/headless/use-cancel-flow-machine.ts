// Internal — shared by `useCancelFlow` (headless) and the `CancelFlow`
// component. Lives under headless/ since it's the headless layer of the
// SDK; the component imports it because there's no separate public/private
// split worth maintaining for one shared file.

import { useCallback, useEffect, useRef, useState } from 'react'
import { ChurnkeyApi } from '../core/api'
import { CancelFlowMachine } from '../core/machine'
import { decodeSessionToken } from '../core/token'
import type { FlowCallbacks, FlowConfig, FlowState } from '../core/types'

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
 * Callbacks reach the machine via thunks that dereference a ref updated each
 * render. This buys two things: the consumer's latest closure always runs,
 * and the fetch effect's dep list stays stable so inline-arrow handlers
 * don't trigger a re-fetch and reset the flow to step 1.
 */
export function useCancelFlowMachine(config: FlowConfig): CancelFlowMachineHandle {
  // FlowConfig extends FlowCallbacks, so storing the whole config gives us
  // access to every callback by name without a separate copy.
  const callbacksRef = useRef(config)
  callbacksRef.current = config

  const [machine] = useState(() => {
    const cb = callbacksRef
    const dispatch: FlowCallbacks = {
      handleDiscount: (o, c) => cb.current.handleDiscount?.(o, c),
      handlePause: (o, c) => cb.current.handlePause?.(o, c),
      handlePlanChange: (o, c) => cb.current.handlePlanChange?.(o, c),
      handleTrialExtension: (o, c) => cb.current.handleTrialExtension?.(o, c),
      handleCancel: (c) => cb.current.handleCancel?.(c),
      onAccept: (o, c) => cb.current.onAccept?.(o, c),
      onDiscount: (o, c) => cb.current.onDiscount?.(o, c),
      onPause: (o, c) => cb.current.onPause?.(o, c),
      onPlanChange: (o, c) => cb.current.onPlanChange?.(o, c),
      onTrialExtension: (o, c) => cb.current.onTrialExtension?.(o, c),
      onCancel: (c) => cb.current.onCancel?.(c),
      onClose: () => cb.current.onClose?.(),
      onStepChange: (step, prevStep) => cb.current.onStepChange?.(step, prevStep),
    }
    return new CancelFlowMachine({ ...config, ...dispatch })
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
      .fetchConfig()
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
