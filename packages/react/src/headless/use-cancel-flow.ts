import type { FlowConfig } from '../core/types'
import { useCancelFlowMachine } from './use-cancel-flow-machine'

export function useCancelFlow(config: FlowConfig) {
  const { machine, state, isLoading, loadError } = useCancelFlowMachine(config)

  return {
    ...state,
    isLoading,
    loadError,
    reasons: machine.reasons,
    currentStep: machine.currentStep,
    currentOffer: machine.currentOffer,
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
