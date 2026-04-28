import { type ReactElement, useEffect } from 'react'
import type { CancelFlowMachine } from '../core/machine'
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
import { appearanceToStyle, defaultTitles } from '../core/utils'
import { useCancelFlowMachine } from '../headless/use-cancel-flow-machine'
import { DefaultConfirm } from './steps/default-confirm'
import { DefaultFeedback } from './steps/default-feedback'
import { DefaultOffer } from './steps/default-offer'
import { DefaultSuccess } from './steps/default-success'
import { DefaultSurvey } from './steps/default-survey'
import { DefaultHeader } from './structural/default-header'
import { DefaultModal } from './structural/default-modal'
import { useColorScheme } from './use-color-scheme'

export function CancelFlow(props: CancelFlowProps) {
  const { machine, state, isLoading, loadError, retry } = useCancelFlowMachine(props)

  if (isLoading || loadError) {
    return (
      <LoadStatus
        appearance={props.appearance}
        classNames={props.classNames}
        components={props.components}
        onClose={props.onClose}
        isLoading={isLoading}
        loadError={loadError}
        onRetry={retry}
      />
    )
  }

  return (
    <FlowShell
      machine={machine}
      state={state}
      appearance={props.appearance}
      classNames={props.classNames}
      components={props.components}
      customComponents={props.customComponents}
    />
  )
}

function LoadStatus({
  appearance,
  classNames,
  components,
  onClose,
  isLoading,
  loadError,
  onRetry,
}: {
  appearance?: CancelFlowProps['appearance']
  classNames?: CancelFlowProps['classNames']
  components?: CancelFlowProps['components']
  onClose?: CancelFlowProps['onClose']
  isLoading: boolean
  loadError: Error | null
  onRetry: () => void
}) {
  const scheme = useColorScheme(appearance?.colorScheme)
  const themeStyle = appearanceToStyle(appearance, scheme)
  const Modal = components?.Modal ?? DefaultModal
  const Header = components?.Header ?? DefaultHeader
  const handleClose = onClose ?? (() => {})

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
                onClick={onRetry}
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
  const currentStep = machine.currentStep
  const title = currentStep?.title ?? defaultTitles[state.step]
  const description = currentStep?.description

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
  const stepConfig = machine.currentStep

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
      const offer = machine.currentOffer
      if (!offer) return null
      // Custom offer types (e.g. 'change-seats') match against
      // customComponents first; built-ins fall through to DefaultOffer.
      const CustomOffer = customComponents?.[offer.type] as ((props: CustomOfferProps) => ReactElement) | undefined
      if (CustomOffer) {
        return (
          <CustomOffer
            offer={offer}
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
          offer={offer}
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
          offer={machine.currentOffer ?? undefined}
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
        return <UnregisteredStepFallback step={state.step} onSkip={machine.next} />
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

// Skips a custom step the consumer didn't register a component for. The skip
// runs in an effect so we don't mutate machine state during render.
function UnregisteredStepFallback({ step, onSkip }: { step: string; onSkip: () => void }) {
  useEffect(() => {
    console.warn(`[churnkey] No component registered for step type "${step}". Skipping.`)
    onSkip()
  }, [step, onSkip])
  return null
}
