import { type ReactElement, useEffect } from 'react'
import { formatPeriodEnd } from '../core/format'
import type { CancelFlowMachine } from '../core/machine'
import { type CancelFlowMessages, formatMessage, selectTiming } from '../core/messages'
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
import { appearanceToStyle, BUILT_IN_OFFER_TYPES } from '../core/utils'
import { useCancelFlowMachine } from '../headless/use-cancel-flow-machine'
import { DefaultConfirm } from './steps/default-confirm'
import { DefaultFeedback } from './steps/default-feedback'
import { DefaultOffer } from './steps/default-offer'
import { DefaultSuccess } from './steps/default-success'
import { DefaultSurvey } from './steps/default-survey'
import { DefaultBackButton } from './structural/default-back-button'
import { DefaultCloseButton } from './structural/default-close-button'
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
        messages={machine.messages}
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
  messages,
}: {
  appearance?: CancelFlowProps['appearance']
  classNames?: CancelFlowProps['classNames']
  components?: CancelFlowProps['components']
  onClose?: CancelFlowProps['onClose']
  isLoading: boolean
  loadError: Error | null
  onRetry: () => void
  messages: CancelFlowMessages
}) {
  const scheme = useColorScheme(appearance?.colorScheme)
  const appearanceStyle = appearanceToStyle(appearance)
  const Modal = components?.Modal ?? DefaultModal
  const CloseButton = components?.CloseButton ?? DefaultCloseButton
  const handleClose = onClose ?? (() => {})

  return (
    <div className="ck-cancel-flow" data-color-scheme={scheme} style={appearanceStyle}>
      <Modal open={true} onClose={handleClose} className={classNames?.modal} overlayClassName={classNames?.overlay}>
        <CloseButton onClose={handleClose} className={classNames?.closeButton} label={messages.common.close} />
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
              <p style={{ color: 'var(--ck-color-text-secondary, #6b7280)' }}>{messages.common.loading}</p>
            </div>
          )}
          {loadError && (
            <div className="ck-error" role="alert" style={{ padding: '32px', textAlign: 'center' }}>
              <p className="ck-error-message" style={{ marginBottom: 16 }}>
                {messages.common.loadError}
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
                {messages.common.tryAgain}
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
  const appearanceStyle = appearanceToStyle(appearance)
  const messages = machine.messages

  const Modal = components?.Modal ?? DefaultModal
  const CloseButton = components?.CloseButton ?? DefaultCloseButton
  const BackButton = components?.BackButton ?? DefaultBackButton

  return (
    <div className="ck-cancel-flow" data-color-scheme={scheme} style={appearanceStyle}>
      <Modal open={true} onClose={machine.close} className={classNames?.modal} overlayClassName={classNames?.overlay}>
        <CloseButton onClose={machine.close} className={classNames?.closeButton} label={messages.common.close} />
        <div className="ck-content">
          {machine.canGoBack && (
            <BackButton onBack={machine.back} className={classNames?.backButton} label={messages.common.back} />
          )}
          {state.error && (
            <div className="ck-error" role="alert">
              <p className="ck-error-message">{messages.common.error}</p>
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
  const messages = machine.messages

  switch (state.step) {
    case 'survey': {
      const Survey = components?.Survey ?? DefaultSurvey
      const config = stepConfig as SurveyStep | undefined
      return (
        <Survey
          title={config?.title ?? messages.survey.title}
          description={config?.description}
          customer={state.customer}
          subscriptions={state.subscriptions}
          reasons={machine.reasons}
          selectedReason={state.selectedReason}
          onSelectReason={machine.selectReason}
          followupResponse={state.followupResponse}
          onFollowupResponseChange={machine.setFollowupResponse}
          onNext={machine.next}
          classNames={config?.classNames}
          components={components}
          messages={messages}
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
            subscriptions={state.subscriptions}
            onAccept={machine.accept}
            onDecline={machine.decline}
            isProcessing={state.isProcessing}
          />
        )
      }
      if (!BUILT_IN_OFFER_TYPES.includes(offer.type)) {
        return <UnregisteredOfferFallback offerType={offer.type} onSkip={machine.decline} />
      }
      const Offer = components?.Offer ?? DefaultOffer
      const config = stepConfig as OfferStep | undefined
      return (
        <Offer
          title={config?.title}
          description={config?.description}
          customer={state.customer}
          subscriptions={state.subscriptions}
          offer={offer}
          onAccept={machine.accept}
          onDecline={machine.decline}
          isProcessing={state.isProcessing}
          classNames={config?.classNames}
          components={components}
          messages={messages}
        />
      )
    }

    case 'feedback': {
      const Feedback = components?.Feedback ?? DefaultFeedback
      const config = stepConfig as FeedbackStep | undefined
      return (
        <Feedback
          title={config?.title ?? messages.feedback.title}
          description={config?.description}
          customer={state.customer}
          subscriptions={state.subscriptions}
          placeholder={config?.placeholder}
          required={config?.required ?? false}
          minLength={config?.minLength ?? 0}
          value={state.feedback}
          onChange={machine.setFeedback}
          onSubmit={machine.next}
          classNames={config?.classNames}
          messages={messages}
        />
      )
    }

    case 'confirm': {
      const Confirm = components?.Confirm ?? DefaultConfirm
      const config = stepConfig as ConfirmStep | undefined
      return (
        <Confirm
          title={config?.title ?? messages.confirm.title}
          description={config?.description}
          customer={state.customer}
          subscriptions={state.subscriptions}
          losses={config?.losses}
          lossesLabel={config?.lossesLabel}
          confirmLabel={config?.confirmLabel ?? selectTiming(messages.confirm.cta, state.cancelAtPeriodEnd)}
          goBackLabel={config?.goBackLabel ?? messages.confirm.goBack}
          periodEndNotice={resolvePeriodEndNotice(state, messages)}
          onConfirm={machine.cancel}
          onGoBack={machine.back}
          isProcessing={state.isProcessing}
          classNames={config?.classNames}
          messages={messages}
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
            isSaved
              ? (config?.savedTitle ?? messages.success.saved.title)
              : (config?.cancelledTitle ?? selectTiming(messages.success.cancelled.title, state.cancelAtPeriodEnd))
          }
          description={
            isSaved
              ? (config?.savedDescription ?? messages.success.saved.description)
              : (config?.cancelledDescription ??
                selectTiming(messages.success.cancelled.description, state.cancelAtPeriodEnd))
          }
          customer={state.customer}
          subscriptions={state.subscriptions}
          onClose={machine.close}
          classNames={config?.classNames}
          messages={messages}
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
          subscriptions={state.subscriptions}
          onNext={machine.next}
          onBack={machine.back}
        />
      )
    }
  }
}

// The notice makes a factual claim about billing behavior, so it requires the
// timing to be KNOWN to be period-end — the server-resolved value in token
// mode. `null` (local mode) stays silent: an earlier hardcoded version of this
// notice was removed precisely because it could contradict the merchant's
// actual setting. Also empty when the period end can't be determined or the
// resolved message is blank.
function resolvePeriodEndNotice(state: FlowState, messages: CancelFlowMessages): string | undefined {
  if (state.cancelAtPeriodEnd !== true) return undefined
  const template = selectTiming(messages.confirm.periodEndNotice, state.cancelAtPeriodEnd)
  if (!template) return undefined
  const periodEnd = formatPeriodEnd(state.subscriptions)
  if (!periodEnd) return undefined
  return formatMessage(template, { periodEnd })
}

// Skip runs in an effect so we don't mutate machine state during render.
function UnregisteredStepFallback({ step, onSkip }: { step: string; onSkip: () => void }) {
  useEffect(() => {
    console.warn(`[churnkey] No component registered for step type "${step}". Skipping.`)
    onSkip()
  }, [step, onSkip])
  return null
}

// Pass machine.decline as onSkip so the auto-advance doesn't record an accept.
function UnregisteredOfferFallback({ offerType, onSkip }: { offerType: string; onSkip: () => void }) {
  useEffect(() => {
    console.warn(`[churnkey] No component registered for offer type "${offerType}". Skipping.`)
    onSkip()
  }, [offerType, onSkip])
  return null
}
