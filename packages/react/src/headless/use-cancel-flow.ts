import { useCallback, useEffect, useState } from 'react'
import { ChurnkeyApi } from '../core/api'
import { CancelFlowMachine } from '../core/machine'
import { decodeSessionToken } from '../core/token'
import type { FlowConfig } from '../core/types'

export function useCancelFlow(config: FlowConfig) {
  const [machine] = useState(() => new CancelFlowMachine(config))
  const [state, setState] = useState(() => machine.getSnapshot())
  const [isLoading, setIsLoading] = useState(!!config.session)
  const [loadError, setLoadError] = useState<Error | null>(null)

  useEffect(() => {
    setState(machine.getSnapshot())
    return machine.subscribe(() => setState(machine.getSnapshot()))
  }, [machine])

  const loadConfig = useCallback(() => {
    if (!config.session) return
    let cancelled = false

    const creds = decodeSessionToken(config.session)
    const api = new ChurnkeyApi(creds)
    api
      .fetchConfig()
      .then((embedData) => {
        if (cancelled) return
        machine.initializeFromEmbed(embedData, api, creds, {
          onAccept: config.onAccept,
          onCancel: config.onCancel,
          onClose: config.onClose,
          onStepChange: config.onStepChange,
        })
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
  }, [config.session, config.onAccept, config.onCancel, config.onClose, config.onStepChange, machine])

  useEffect(() => {
    return loadConfig()
  }, [loadConfig])

  return {
    ...state,
    isLoading,
    loadError,
    reasons: machine.reasons,
    stepIndex: machine.stepIndex,
    totalSteps: machine.totalSteps,
    selectReason: machine.selectReason,
    setFeedback: machine.setFeedback,
    accept: machine.accept,
    decline: machine.decline,
    cancel: machine.cancel,
    next: machine.next,
    back: machine.back,
    close: machine.close,
  }
}
