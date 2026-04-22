import { type ReactElement, useCallback, useEffect, useState } from 'react'
import { ChurnkeyApi } from '../core/api'
import { CancelFlowMachine } from '../core/machine'
import { decodeSessionToken } from '../core/token'
import type {
  CancelFlowProps,
  ComponentOverrides,
  ConfirmStep,
  CustomComponents,
  CustomOfferProps,
  CustomStepProps,
  FeedbackStep,
  FlowState,
  OfferStep,
  SuccessStep,
  SurveyStep,
} from '../core/types'
import { useColorScheme } from '../core/use-color-scheme'
import { appearanceToStyle, defaultTitles } from '../core/utils'
import { DefaultConfirm } from './steps/default-confirm'
import { DefaultFeedback } from './steps/default-feedback'
import { DefaultOffer } from './steps/default-offer'
import { DefaultSuccess } from './steps/default-success'
import { DefaultSurvey } from './steps/default-survey'
import { DefaultHeader } from './structural/default-header'
import { DefaultModal } from './structural/default-modal'

export function CancelFlow(props: CancelFlowProps) {
  if (props.session) return <TokenCancelFlow {...props} />
  return <LocalCancelFlow {...props} />
}

// Local mode — steps defined in props

function LocalCancelFlow({
  appId,
  customer,
  subscriptions,
  steps,
  apiBaseUrl,
  mode,
  appearance,
  classNames,
  components,
  customComponents,
  onAccept,
  onCancel,
  onClose,
  onStepChange,
}: CancelFlowProps) {
  const [machine] = useState(
    () =>
      new CancelFlowMachine({
        appId,
        customer,
        subscriptions,
        steps,
        apiBaseUrl,
        mode,
        onAccept,
        onCancel,
        onClose,
        onStepChange,
      }),
  )
  const [state, setState] = useState<FlowState>(() => machine.getSnapshot())

  useEffect(() => {
    setState(machine.getSnapshot())
    return machine.subscribe(() => setState(machine.getSnapshot()))
  }, [machine])

  return (
    <FlowShell
      machine={machine}
      state={state}
      appearance={appearance}
      classNames={classNames}
      components={components}
      customComponents={customComponents}
    />
  )
}

// Token mode — fetches config from API, then renders

function TokenCancelFlow({
  session,
  apiBaseUrl,
  appearance,
  classNames,
  components,
  customComponents,
  onAccept,
  onCancel,
  onClose,
  onStepChange,
}: CancelFlowProps) {
  const [machine] = useState(() => new CancelFlowMachine({ session }))
  const [state, setState] = useState<FlowState>(() => machine.getSnapshot())
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<Error | null>(null)

  useEffect(() => {
    setState(machine.getSnapshot())
    return machine.subscribe(() => setState(machine.getSnapshot()))
  }, [machine])

  const loadConfig = useCallback(() => {
    setLoadError(null)
    setIsLoading(true)
    const creds = decodeSessionToken(session!)
    const api = new ChurnkeyApi(creds, apiBaseUrl)
    api
      .fetchConfig()
      .then((embedData) => {
        machine.initializeFromEmbed(embedData, api, creds, { onAccept, onCancel, onClose, onStepChange })
        setIsLoading(false)
      })
      .catch((err) => {
        setLoadError(err instanceof Error ? err : new Error(String(err)))
        setIsLoading(false)
      })
  }, [session, apiBaseUrl, machine, onAccept, onCancel, onClose, onStepChange])

  useEffect(() => {
    if (session) loadConfig()
  }, [session, loadConfig])

  const scheme = useColorScheme(appearance?.colorScheme)
  const themeStyle = appearanceToStyle(appearance, scheme)
  const Modal = components?.Modal ?? DefaultModal
  const Header = components?.Header ?? DefaultHeader
  const handleClose = onClose ?? (() => {})

  if (isLoading || loadError) {
    return (
      <div className="ck-cancel-flow" style={themeStyle}>
        <Modal open={true} onClose={handleClose} className={classNames?.modal}>
          <Header
            title={isLoading ? 'Loading...' : 'Something went wrong'}
            step={0}
            totalSteps={0}
            onClose={handleClose}
            className={classNames?.header}
          />
          <div className="ck-content">
            {isLoading && (
              <div className="ck-loading" style={{ padding: '32px', textAlign: 'center' }}>
                <div
                  className="ck-loading-spinner"
                  style={{
                    width: 32,
                    height: 32,
                    border: '3px solid var(--ck-color-border, #e5e7eb)',
                    borderTopColor: 'var(--ck-color-primary, #2563eb)',
                    borderRadius: '50%',
                    animation: 'ck-spin 0.6s linear infinite',
                    margin: '0 auto 16px',
                  }}
                />
                <p style={{ color: 'var(--ck-color-text-secondary, #6b7280)' }}>Loading your options...</p>
              </div>
            )}
            {loadError && (
              <div className="ck-error" role="alert" style={{ padding: '32px', textAlign: 'center' }}>
                <p className="ck-error-message" style={{ marginBottom: 16 }}>
                  We couldn't load your cancellation options. Please try again.
                </p>
                <button
                  type="button"
                  className="ck-retry-button"
                  onClick={loadConfig}
                  style={{
                    padding: '8px 20px',
                    fontSize: 14,
                    fontWeight: 600,
                    background: 'var(--ck-color-primary, #2563eb)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 'var(--ck-border-radius, 8px)',
                    cursor: 'pointer',
                  }}
                >
                  Try again
                </button>
              </div>
            )}
          </div>
        </Modal>
      </div>
    )
  }

  return (
    <FlowShell
      machine={machine}
      state={state}
      appearance={appearance}
      classNames={classNames}
      components={components}
      customComponents={customComponents}
    />
  )
}

interface FlowShellProps {
  machine: CancelFlowMachine
  state: FlowState
  appearance?: CancelFlowProps['appearance']
  classNames?: CancelFlowProps['classNames']
  components?: CancelFlowProps['components']
  customComponents?: CustomComponents
}

function FlowShell({ machine, state, appearance, classNames, components, customComponents }: FlowShellProps) {
  const scheme = useColorScheme(appearance?.colorScheme)
  const themeStyle = appearanceToStyle(appearance, scheme)

  const Modal = components?.Modal ?? DefaultModal
  const Header = components?.Header ?? DefaultHeader
  const stepConfig = machine.getStepConfig(state.step)
  const title =
    stepConfig && 'title' in stepConfig ? (stepConfig.title ?? defaultTitles[state.step]) : defaultTitles[state.step]
  const description =
    stepConfig && 'description' in stepConfig ? (stepConfig as { description?: string }).description : undefined

  return (
    <div className="ck-cancel-flow" style={themeStyle}>
      <Modal open={true} onClose={machine.close} className={classNames?.modal}>
        <Header
          title={title}
          description={description}
          step={machine.stepIndex}
          totalSteps={machine.totalSteps}
          onClose={machine.close}
          className={classNames?.header}
        />
        <div className="ck-content">
          {state.error && (
            <div className="ck-error" role="alert">
              <p className="ck-error-message">Something went wrong. Please try again.</p>
            </div>
          )}
          <StepRenderer state={state} machine={machine} components={components} customComponents={customComponents} />
        </div>
      </Modal>
    </div>
  )
}

function StepRenderer({
  state,
  machine,
  components,
  customComponents,
}: {
  state: FlowState
  machine: CancelFlowMachine
  components?: Partial<ComponentOverrides>
  customComponents?: CustomComponents
}) {
  const stepConfig = machine.getStepConfig(state.step)

  switch (state.step) {
    case 'survey': {
      const Survey = components?.Survey ?? DefaultSurvey
      const config = stepConfig as SurveyStep | undefined
      return (
        <Survey
          title={config?.title ?? defaultTitles.survey}
          description={config?.description}
          reasons={machine.reasons}
          selectedReason={state.selectedReason}
          onSelectReason={machine.selectReason}
          onNext={machine.next}
          classNames={config?.classNames}
          components={components}
        />
      )
    }

    case 'offer': {
      if (!state.recommendation) return null
      // A custom offer type (e.g. 'change-seats') renders its registered
      // component if provided; built-in offer types fall through to DefaultOffer.
      const CustomOffer = customComponents?.[state.recommendation.type] as
        | ((props: CustomOfferProps) => ReactElement)
        | undefined
      if (CustomOffer) {
        return (
          <CustomOffer
            offer={state.recommendation}
            customer={state.customer}
            onAccept={machine.accept}
            onDecline={machine.decline}
            isProcessing={state.isProcessing}
          />
        )
      }
      const Offer = components?.Offer ?? DefaultOffer
      const config = stepConfig as OfferStep | undefined
      return (
        <Offer
          title={config?.title}
          description={config?.description}
          offer={state.recommendation}
          alternatives={state.alternatives}
          onAccept={machine.accept}
          onDecline={machine.decline}
          isProcessing={state.isProcessing}
          classNames={config?.classNames}
          components={components}
        />
      )
    }

    case 'feedback': {
      const Feedback = components?.Feedback ?? DefaultFeedback
      const config = stepConfig as FeedbackStep | undefined
      return (
        <Feedback
          title={config?.title ?? defaultTitles.feedback}
          description={config?.description}
          placeholder={config?.placeholder}
          required={config?.required ?? false}
          minLength={config?.minLength ?? 0}
          value={state.feedback}
          onChange={machine.setFeedback}
          onSubmit={machine.next}
          classNames={config?.classNames}
        />
      )
    }

    case 'confirm': {
      const Confirm = components?.Confirm ?? DefaultConfirm
      const config = stepConfig as ConfirmStep | undefined
      return (
        <Confirm
          title={config?.title ?? defaultTitles.confirm}
          description={config?.description}
          confirmLabel={config?.confirmLabel ?? 'Cancel subscription'}
          goBackLabel={config?.goBackLabel ?? 'Go back'}
          onConfirm={machine.cancel}
          onGoBack={machine.back}
          isProcessing={state.isProcessing}
          classNames={config?.classNames}
        />
      )
    }

    case 'success': {
      const Success = components?.Success ?? DefaultSuccess
      const config = stepConfig as SuccessStep | undefined
      const isSaved = state.outcome === 'saved'
      return (
        <Success
          outcome={state.outcome ?? 'cancelled'}
          offer={state.recommendation ?? undefined}
          title={
            isSaved ? (config?.savedTitle ?? 'Welcome back!') : (config?.cancelledTitle ?? 'Subscription cancelled')
          }
          description={
            isSaved
              ? (config?.savedDescription ?? 'Your offer has been applied.')
              : (config?.cancelledDescription ?? "We're sorry to see you go.")
          }
          onClose={machine.close}
          classNames={config?.classNames}
        />
      )
    }

    default: {
      const CustomStep = customComponents?.[state.step] as ((props: CustomStepProps) => ReactElement) | undefined

      if (!CustomStep) {
        console.warn(`[churnkey] No component registered for step type "${state.step}". Skipping.`)
        machine.next()
        return null
      }

      const config = stepConfig as CustomStepProps['step'] | undefined

      return (
        <CustomStep
          step={{
            type: state.step,
            title: config?.title,
            description: config?.description,
            data: config?.data,
          }}
          customer={state.customer}
          onNext={machine.next}
          onBack={machine.back}
        />
      )
    }
  }
}
