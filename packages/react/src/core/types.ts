import type { ComponentType, ReactElement, ReactNode } from 'react'
import type { EmbedCustomer } from './api-types'

// --- Offers ---

export interface DiscountOffer {
  type: 'discount'
  percent: number
  months: number
  couponId?: string
}
export interface PauseOffer {
  type: 'pause'
  months: number
  interval?: 'month' | 'week'
  datePicker?: boolean
}
export interface PlanChangeOffer {
  type: 'plan_change'
  plans: Plan[]
  currentPlanId?: string
}
export interface TrialExtensionOffer {
  type: 'trial_extension'
  days: number
}
export interface ContactOffer {
  type: 'contact'
  url?: string
  label?: string
}
export interface RedirectOffer {
  type: 'redirect'
  url: string
  label: string
}

export interface CustomOfferConfig {
  type: string
  data?: Record<string, unknown>
}

export type BuiltInOfferConfig =
  | DiscountOffer
  | PauseOffer
  | PlanChangeOffer
  | TrialExtensionOffer
  | ContactOffer
  | RedirectOffer
export type OfferConfig = BuiltInOfferConfig | CustomOfferConfig

export type OfferDecision = OfferConfig & { copy: OfferCopy; decisionId?: string }

export interface OfferCopy {
  headline: string
  body: string
  cta: string
  declineCta: string
}

export type AcceptedOffer = OfferConfig & {
  reasonId: string
  decisionId?: string
  result?: Record<string, unknown>
}

export interface Plan {
  id: string
  name: string
  price: number
  interval: 'month' | 'year'
  currency: string
  features?: string[]
}

// --- Reasons ---

export interface ReasonConfig {
  id: string
  label: string
  freeform?: boolean
  offer?: OfferConfig
}

// --- Steps ---

export interface SurveyStep {
  type: 'survey'
  title?: string
  description?: string
  reasons: ReasonConfig[]
  classNames?: SurveyClassNames
}

export interface OfferStep {
  type: 'offer'
  title?: string
  description?: string
  classNames?: OfferClassNames
}

export interface FeedbackStep {
  type: 'feedback'
  title?: string
  description?: string
  placeholder?: string
  required?: boolean
  minLength?: number
  classNames?: FeedbackClassNames
}

export interface ConfirmStep {
  type: 'confirm'
  title?: string
  description?: string
  confirmLabel?: string
  goBackLabel?: string
  classNames?: ConfirmClassNames
}

export interface SuccessStep {
  type: 'success'
  savedTitle?: string
  savedDescription?: string
  cancelledTitle?: string
  cancelledDescription?: string
  classNames?: SuccessClassNames
}

export interface CustomStepConfig {
  type: string
  title?: string
  description?: string
  data?: Record<string, unknown>
}

export type BuiltInStep = SurveyStep | OfferStep | FeedbackStep | ConfirmStep | SuccessStep
export type Step = BuiltInStep | CustomStepConfig

export type BuiltInStepType = 'survey' | 'offer' | 'feedback' | 'confirm' | 'success'

// --- Per-step classNames ---

export interface SurveyClassNames {
  root?: string
  title?: string
  description?: string
  reasonList?: string
  reasonButton?: string
  reasonButtonSelected?: string
  reasonLabel?: string
  freeformInput?: string
  continueButton?: string
}

export interface OfferClassNames {
  root?: string
  card?: string
  headline?: string
  body?: string
  acceptButton?: string
  declineButton?: string
  discountBadge?: string
  priceComparison?: string
  pauseSlider?: string
  planGrid?: string
  planCard?: string
  planCardSelected?: string
}

export interface FeedbackClassNames {
  root?: string
  title?: string
  description?: string
  textarea?: string
  characterCount?: string
  submitButton?: string
}

export interface ConfirmClassNames {
  root?: string
  title?: string
  description?: string
  confirmButton?: string
  goBackButton?: string
  periodEndNotice?: string
}

export interface SuccessClassNames {
  root?: string
  icon?: string
  title?: string
  description?: string
  closeButton?: string
}

// --- Structural classNames ---

export interface StructuralClassNames {
  overlay?: string
  modal?: string
  header?: string
  footer?: string
  progressBar?: string
  progressFill?: string
}

// --- Appearance ---

export interface ThemeVariables {
  colorPrimary: string
  colorPrimaryHover: string
  colorBackground: string
  colorText: string
  colorTextSecondary: string
  colorBorder: string
  colorDanger: string
  colorSuccess: string
  fontFamily: string
  fontSize: string
  borderRadius: string
}

export interface Appearance {
  theme?: 'default' | 'minimal' | 'rounded' | 'corporate' | 'inline'
  colorScheme?: 'auto' | 'light' | 'dark'
  variables?: Partial<ThemeVariables>
}

export interface CustomStepProps {
  step: CustomStepConfig
  customer: EmbedCustomer | null
  onNext: (result?: Record<string, unknown>) => void
  onBack: () => void
}

export interface CustomOfferProps {
  offer: OfferDecision
  customer: EmbedCustomer | null
  onAccept: (result?: Record<string, unknown>) => Promise<void>
  onDecline: () => void
  isProcessing: boolean
}

// --- Component overrides ---

export interface ComponentOverrides {
  // Structural
  Modal?: (props: ModalProps) => ReactElement
  Header?: (props: HeaderProps) => ReactElement
  Footer?: (props: FooterProps) => ReactElement
  ProgressBar?: (props: ProgressBarProps) => ReactElement

  // Step-level (replace entire built-in step)
  Survey?: (props: SurveyStepProps) => ReactElement
  Offer?: (props: OfferStepProps) => ReactElement
  Feedback?: (props: FeedbackStepProps) => ReactElement
  Confirm?: (props: ConfirmStepProps) => ReactElement
  Success?: (props: SuccessStepProps) => ReactElement

  // Sub-component (replace part of a step)
  ReasonButton?: (props: ReasonButtonProps) => ReactElement
  OfferCard?: (props: OfferCardProps) => ReactElement
  DiscountDetails?: (props: DiscountDetailsProps) => ReactElement
  PauseDetails?: (props: PauseDetailsProps) => ReactElement
  PlanChangeGrid?: (props: PlanChangeGridProps) => ReactElement
  TrialExtensionDetails?: (props: TrialExtensionDetailsProps) => ReactElement
}

export type CustomComponents = Record<string, ComponentType<CustomStepProps> | ComponentType<CustomOfferProps>>

// --- Structural component props ---

export interface ModalProps {
  open: boolean
  onClose: () => void
  children: ReactNode
  className?: string
}

export interface HeaderProps {
  title: string
  description?: string
  step: number
  totalSteps: number
  onClose: () => void
  className?: string
}

export interface FooterProps {
  onBack?: () => void
  onNext?: () => void
  backLabel?: string
  nextLabel?: string
  className?: string
}

export interface ProgressBarProps {
  current: number
  total: number
  className?: string
}

// --- Step component props ---

export interface SurveyStepProps {
  title: string
  description?: string
  reasons: ReasonConfig[]
  selectedReason: string | null
  onSelectReason: (id: string) => void
  onNext: () => void
  classNames?: SurveyClassNames
  components?: Partial<ComponentOverrides>
}

export interface OfferStepProps {
  title?: string
  description?: string
  offer: OfferDecision
  alternatives: OfferDecision[]
  onAccept: () => Promise<void>
  onDecline: () => void
  isProcessing: boolean
  classNames?: OfferClassNames
  components?: Partial<ComponentOverrides>
}

export interface FeedbackStepProps {
  title: string
  description?: string
  placeholder?: string
  required: boolean
  minLength: number
  value: string
  onChange: (text: string) => void
  onSubmit: () => void
  classNames?: FeedbackClassNames
}

export interface ConfirmStepProps {
  title: string
  description?: string
  confirmLabel: string
  goBackLabel: string
  periodEnd?: string
  onConfirm: () => Promise<void>
  onGoBack: () => void
  isProcessing: boolean
  classNames?: ConfirmClassNames
}

export interface SuccessStepProps {
  outcome: 'saved' | 'cancelled'
  offer?: OfferDecision
  title: string
  description?: string
  onClose: () => void
  classNames?: SuccessClassNames
}

// --- Sub-component props ---

export interface ReasonButtonProps {
  reason: ReasonConfig
  isSelected: boolean
  onSelect: (id: string) => void
}

export interface OfferCardProps {
  offer: OfferDecision
  onAccept: () => Promise<void>
  onDecline: () => void
  isProcessing: boolean
  classNames?: OfferClassNames
  DiscountDetails: () => ReactElement
  PauseDetails: () => ReactElement
  PlanChangeGrid: () => ReactElement
  TrialExtensionDetails: () => ReactElement
}

export interface DiscountDetailsProps {
  percent: number
  months: number
  originalPrice: number
  discountedPrice: number
  currency: string
  interval: 'month' | 'year'
  couponId?: string
}

export interface PauseDetailsProps {
  maxDuration: number
  interval: 'month' | 'week'
  selectedDuration: number
  onChangeDuration: (duration: number) => void
  resumeDate: string
  datePicker?: boolean
}

export interface PlanChangeGridProps {
  plans: Plan[]
  currentPlan: Plan
  selectedPlan: Plan | null
  onSelectPlan: (plan: Plan) => void
}

export interface TrialExtensionDetailsProps {
  days: number
  currentEndDate: string
  newEndDate: string
}

// --- Flow state ---

export interface FlowState {
  step: string
  selectedReason: string | null
  recommendation: OfferDecision | null
  alternatives: OfferDecision[]
  feedback: string
  outcome: 'saved' | 'cancelled' | null
  isProcessing: boolean
  error: Error | null
  customer: EmbedCustomer | null
}

// --- Flow config ---

export interface FlowConfig {
  session?: string
  steps?: Step[]
  onAccept?: (offer: AcceptedOffer) => Promise<void>
  onCancel?: () => Promise<void>
  onClose?: () => void
  onStepChange?: (step: string, prevStep: string) => void
}

// --- Resolved flow config (internal) ---

export interface ResolvedFlowConfig {
  reasons: ReasonConfig[]
  steps: Step[]
  onAccept?: (offer: AcceptedOffer) => Promise<void>
  onCancel?: () => Promise<void>
  onClose?: () => void
  onStepChange?: (step: string, prevStep: string) => void
}

// --- CancelFlow props ---

export interface CancelFlowProps {
  session?: string
  steps?: Step[]
  apiBaseUrl?: string
  appearance?: Appearance
  classNames?: StructuralClassNames
  components?: Partial<ComponentOverrides>
  customComponents?: CustomComponents
  layout?: {
    desktop?: 'modal' | 'inline' | 'drawer'
    mobile?: 'sheet' | 'fullscreen' | 'inline'
    breakpoint?: number
  }
  animation?: 'css' | 'framer' | 'none'
  onAccept: (offer: AcceptedOffer) => Promise<void>
  onCancel: () => Promise<void>
  onClose?: () => void
  onStepChange?: (step: string, prevStep: string) => void
}
