// Internal — shared by `useCancelFlow` (headless) and the `CancelFlow`
// component. Lives under headless/ since it's the headless layer of the
// SDK; the component imports it because there's no separate public/private
// split worth maintaining for one shared file.

import { useCallback, useEffect, useRef, useState } from 'react'
import { ChurnkeyApi } from '../core/api'
import { CancelFlowMachine } from '../core/machine'
import { decodeSessionToken } from '../core/token'
import type { AcceptedOffer, FlowConfig, FlowState } from '../core/types'

export interface CancelFlowMachineHandle {
  machine: CancelFlowMachine
  state: FlowState
  isLoading: boolean
  loadError: Error | null
  /** Re-fetch the embed config (token mode only). No-op if no session. */
  retry: () => void
}

/**
 * Wires a CancelFlowMachine to React lifecycle. Used internally by both the
 * `CancelFlow` component and the `useCancelFlow` hook - not part of the
 * public API.
 *
 * Callbacks are passed to the machine via thunks that dereference a ref
 * updated each render. Two reasons:
 *   1. The consumer's latest closure is always called.
 *   2. The fetch effect's dep list stays stable. Without this, inline-arrow
 *      handlers from the consumer would change identity each render, the
 *      effect would re-fire, and the token-mode flow would reset to step 1.
 */
export function useCancelFlowMachine(config: FlowConfig): CancelFlowMachineHandle {
  const callbacksRef = useRef({
    onAccept: config.onAccept,
    onCancel: config.onCancel,
    onClose: config.onClose,
    onStepChange: config.onStepChange,
  })
  callbacksRef.current = {
    onAccept: config.onAccept,
    onCancel: config.onCancel,
    onClose: config.onClose,
    onStepChange: config.onStepChange,
  }

  const [machine] = useState(() => {
    const dispatch = {
      onAccept: async (offer: AcceptedOffer) => callbacksRef.current.onAccept?.(offer),
      onCancel: async () => callbacksRef.current.onCancel?.(),
      onClose: () => callbacksRef.current.onClose?.(),
      onStepChange: (step: string, prevStep: string) => callbacksRef.current.onStepChange?.(step, prevStep),
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
      .then((embedData) => {
        if (cancelled) return
        machine.initializeFromEmbed(embedData, api, creds)
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
