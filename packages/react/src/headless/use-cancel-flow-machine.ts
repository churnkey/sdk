// Internal — shared by `useCancelFlow` (headless) and the `CancelFlow`
// component. Lives under headless/ since it's the headless layer of the
// SDK; the component imports it because there's no separate public/private
// split worth maintaining for one shared file.

import { useCallback, useEffect, useRef, useState } from 'react'
import { ChurnkeyApi } from '../core/api'
import { CancelFlowMachine } from '../core/machine'
import { resolveLocale } from '../core/messages'
import { decodeSessionToken } from '../core/token'
import type { FlowCallbacks, FlowConfig, FlowState } from '../core/types'
import { hasLocalePack, loadLocaleMessages, peekLocaleMessages } from '../locales'

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

  // `i18n` is read once at mount, like `steps`: the machine keeps the
  // messages and a locale change would otherwise restart the flow.
  const [explicitLocale] = useState(() => config.i18n?.locale)

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
    const machine = new CancelFlowMachine(machineConfig)
    // A pack an earlier mount already loaded goes on before the first render,
    // so reopening the flow does not flash a spinner or English.
    const cached = explicitLocale && peekLocaleMessages(explicitLocale)
    if (cached) machine.setLocale(explicitLocale, cached)
    return machine
  })

  const [state, setState] = useState<FlowState>(() => machine.getSnapshot())
  // Local modes with an explicit, non-English locale wait for its pack (a
  // separate chunk) so the first step never shows in English. The server
  // render and the first client render both see no cached pack, so they
  // agree on the spinner.
  const awaitingLocalPack =
    !config.session && !!explicitLocale && hasLocalePack(explicitLocale) && !peekLocaleMessages(explicitLocale)
  const [isLoading, setIsLoading] = useState(!!config.session || awaitingLocalPack)
  const [loadError, setLoadError] = useState<Error | null>(null)

  useEffect(() => {
    setState(machine.getSnapshot())
    return machine.subscribe(() => setState(machine.getSnapshot()))
  }, [machine])

  useEffect(() => {
    if (config.session || !explicitLocale || !hasLocalePack(explicitLocale)) return
    let cancelled = false
    loadLocaleMessages(explicitLocale).then((pack) => {
      if (cancelled) return
      machine.setLocale(explicitLocale, pack)
      setIsLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [config.session, explicitLocale, machine])

  const loadConfig = useCallback(() => {
    if (!config.session) return
    setLoadError(null)
    setIsLoading(true)
    let cancelled = false
    const creds = decodeSessionToken(config.session)
    const api = new ChurnkeyApi(creds, config.apiBaseUrl, callbacksRef.current.stackedOffers)
    // The server translates the flow into `language` when the org's Automatic
    // Translations cover it, and says so on the response. An explicit locale
    // is the chrome language regardless, so its pack goes on as soon as it
    // lands (even the loading copy is translated). A detected one is only a
    // guess until the server answers: the pack is fetched alongside the config
    // and applied when the content came back in that language, so the chrome
    // never switches language on its own.
    const language = resolveLocale(explicitLocale)
    const pack = loadLocaleMessages(language)
    if (explicitLocale) {
      pack.then((messages) => {
        if (!cancelled) machine.setLocale(explicitLocale, messages)
      })
    }
    Promise.all([
      // Read through the ref, not the closure: an inline `customerAttributes`
      // object literal would otherwise join the dep list and re-fetch (and
      // reset the flow) on every render.
      api.fetchConfig(callbacksRef.current.customerAttributes, language),
      pack,
    ])
      .then(([sdkConfig, messages]) => {
        if (cancelled) return
        if (!explicitLocale && sdkConfig.language) machine.setLocale(sdkConfig.language, messages)
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
  }, [config.session, config.apiBaseUrl, explicitLocale, machine])

  useEffect(() => {
    if (!config.session) return
    return loadConfig()
  }, [config.session, loadConfig])

  return { machine, state, isLoading, loadError, retry: loadConfig }
}
