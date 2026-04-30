import type { ComponentType, ReactElement, ReactNode } from 'react'

// ─── Direct shape — billing data passed in and out of the SDK ─────────────
//
// Used both for consumer-supplied props (customer, subscriptions) and for
// data the SDK receives in token mode, so there's no translation layer in
// between. Provider-agnostic and intentionally minimal — only the fields the
// cancel flow needs to render and record sessions.

export interface DirectAddress {
  line1?: string
  line2?: string
  city?: string
  state?: string
  postalCode?: string
  /** ISO 3166-1 alpha-2 */
  country?: string
}

export interface DirectCustomer {
  id: string
  email?: string
  name?: string
  lastName?: string
  phone?: string
  /** ISO 4217 */
  currency?: string
  addresses?: DirectAddress[]
  metadata?: Record<string, unknown>
}

export interface DirectPrice {
  id: string
  type?: 'standalone' | 'product'
  active?: boolean
  productId?: string
  name?: string
  description?: string
  duration?: {
    interval: 'day' | 'week' | 'month' | 'year'
    intervalCount?: number
  }
  amount: {
    model?: 'fixed' | 'tiered'
    /** Smallest currency unit (cents for USD). */
    value: number
    currency?: string
  }
  metadata?: Record<string, unknown>
}

export interface DirectCoupon {
  id?: string
  name?: string
  percentOff?: number
  /** Smallest currency unit (cents for USD). */
  amountOff?: number
  currency?: string
  duration?: 'once' | 'repeating' | 'forever'
  durationInMonths?: number
  metadata?: Record<string, unknown>
}

export type SubscriptionStatus =
  | { name: 'active'; currentPeriod: { start: Date | string; end: Date | string } }
  | {
      name: 'trial'
      trial: { start: Date | string; end: Date | string }
      currentPeriod?: { start: Date | string; end: Date | string }
    }
  | {
      name: 'paused'
      pause: { start: Date | string; end?: Date | string }
      currentPeriod?: { start: Date | string; end: Date | string }
    }
  | { name: 'canceled'; canceledAt: Date | string }
  | { name: 'unpaid'; currentPeriod?: { start: Date | string; end: Date | string } }
  | { name: 'future'; currentPeriod?: { start: Date | string; end: Date | string } }

export interface DirectSubscriptionItem {
  id?: string
  price: DirectPrice
  quantity?: number
}

export interface DirectSubscription {
  id: string
  customerId?: string
  start: Date | string
  status: SubscriptionStatus
  items: DirectSubscriptionItem[]
  duration?: {
    interval: 'day' | 'week' | 'month' | 'year'
    intervalCount?: number
  }
  end?: Date | string
  discounts?: Array<{
    id?: string
    coupon?: DirectCoupon
    start?: Date | string
    end?: Date | string
  }>
  metadata?: Record<string, unknown>
}

// ─── Offers ──────────────────────────────────────────────────────────────────
//
// Local-mode developers write the same offer shape the SDK receives in
// token mode, so behavior is consistent across modes.

export interface DiscountOffer {
  type: 'discount'
  couponId?: string
  percentOff?: number
  /** Smallest currency unit (cents for USD). */
  amountOff?: number
  currency?: string
  durationInMonths?: number
}

export interface PauseOffer {
  type: 'pause'
  months: number
  interval?: 'month' | 'week'
  datePicker?: boolean
}

export interface PlanChangeOffer {
  type: 'plan_change'
  plans: PlanOption[]
  currentPlanId?: string
}

/**
 * Plan option in a `plan_change` offer — `DirectPrice` plus optional
 * cancel-flow merchandising fields. Marketing fields are presentation-only
 * and live on `PlanOption` rather than `DirectPrice` so `Direct` stays a
 * clean billing-data shape reusable outside the cancel-flow context.
 */
export interface PlanOption extends DirectPrice {
  /** Short marketing line (e.g. "Most popular"). */
  tagline?: string
  /** Bullet list of plan features shown on the card. */
  features?: string[]
  /** Pre-formatted "before" price rendered struck-through (e.g. "$49/mo"). */
  msrp?: string
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

// ─── Reasons ─────────────────────────────────────────────────────────────────

export interface ReasonConfig {
  id: string
  label: string
  freeform?: boolean
  offer?: OfferConfig
}

// ─── Steps ───────────────────────────────────────────────────────────────────
//
// `guid` is optional. Set it for stable identity (React keys, test assertions);
// otherwise the SDK auto-generates one at graph-build time. In token mode,
// server-supplied steps already carry guids for analytics correlation.

export interface SurveyStep {
  type: 'survey'
  guid?: string
  title?: string
  description?: string
  reasons: ReasonConfig[]
  classNames?: SurveyClassNames
}

export interface OfferStep {
  type: 'offer'
  guid?: string
  title?: string
  description?: string
  /**
   * Offer attached to this step. Set this for proactive save offers shown
   * outside a survey; the SDK also populates it automatically on synthetic
   * offer steps spawned from survey choices.
   */
  offer?: OfferDecision
  classNames?: OfferClassNames
}

export interface FeedbackStep {
  type: 'feedback'
  guid?: string
  title?: string
  description?: string
  placeholder?: string
  required?: boolean
  minLength?: number
  classNames?: FeedbackClassNames
}

export interface ConfirmStep {
  type: 'confirm'
  guid?: string
  title?: string
  description?: string
  confirmLabel?: string
  goBackLabel?: string
  classNames?: ConfirmClassNames
}

export interface SuccessStep {
  type: 'success'
  guid?: string
  savedTitle?: string
  savedDescription?: string
  cancelledTitle?: string
  cancelledDescription?: string
  classNames?: SuccessClassNames
}

export interface CustomStepConfig {
  type: string
  guid?: string
  title?: string
  description?: string
  data?: Record<string, unknown>
}

export type BuiltInStep = SurveyStep | OfferStep | FeedbackStep | ConfirmStep | SuccessStep
export type Step = BuiltInStep | CustomStepConfig

export type BuiltInStepType = 'survey' | 'offer' | 'feedback' | 'confirm' | 'success'

// ─── Per-step classNames ─────────────────────────────────────────────────────

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
  title?: string
  description?: string
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

// ─── Structural classNames ───────────────────────────────────────────────────

export interface StructuralClassNames {
  overlay?: string
  modal?: string
  closeButton?: string
  backButton?: string
}

// ─── Appearance ──────────────────────────────────────────────────────────────

export interface AppearanceVariables {
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
  /**
   * `'auto'` follows the user's OS preference (`prefers-color-scheme`) and
   * watches for changes. Default: `'light'`.
   */
  colorScheme?: 'auto' | 'light' | 'dark'
  variables?: Partial<AppearanceVariables>
}

export interface CustomStepProps {
  step: CustomStepConfig
  customer: DirectCustomer | null
  onNext: (result?: Record<string, unknown>) => void
  onBack: () => void
}

export interface CustomOfferProps {
  offer: OfferDecision
  customer: DirectCustomer | null
  onAccept: (result?: Record<string, unknown>) => Promise<void>
  onDecline: () => void
  isProcessing: boolean
}

// ─── Component overrides ─────────────────────────────────────────────────────

export interface ComponentOverrides {
  // Structural
  Modal?: (props: ModalProps) => ReactElement
  CloseButton?: (props: CloseButtonProps) => ReactElement
  BackButton?: (props: BackButtonProps) => ReactElement

  // Step-level (replace entire built-in step)
  Survey?: (props: SurveyStepProps) => ReactElement
  Offer?: (props: OfferStepProps) => ReactElement
  Feedback?: (props: FeedbackStepProps) => ReactElement
  Confirm?: (props: ConfirmStepProps) => ReactElement
  Success?: (props: SuccessStepProps) => ReactElement

  // Sub-component (replace part of a step)
  ReasonButton?: (props: ReasonButtonProps) => ReactElement

  // Per-type offer slots. Each owns its full canvas (title, description,
  // body, buttons) just like the step-level defaults — replacing one
  // gives full control over a single offer type. To take over offer
  // routing entirely, override `Offer` instead.
  DiscountOffer?: (props: OfferStepProps) => ReactElement
  PauseOffer?: (props: OfferStepProps) => ReactElement
  PlanChangeOffer?: (props: OfferStepProps) => ReactElement
  TrialExtensionOffer?: (props: OfferStepProps) => ReactElement
  ContactOffer?: (props: OfferStepProps) => ReactElement
  RedirectOffer?: (props: OfferStepProps) => ReactElement
}

export type CustomComponents = Record<string, ComponentType<CustomStepProps> | ComponentType<CustomOfferProps>>

// ─── Structural component props ──────────────────────────────────────────────

export interface ModalProps {
  open: boolean
  onClose: () => void
  children: ReactNode
  className?: string
}

export interface CloseButtonProps {
  onClose: () => void
  className?: string
}

export interface BackButtonProps {
  onBack: () => void
  className?: string
}

// ─── Step component props ────────────────────────────────────────────────────

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
  /**
   * Accept the offer. The optional `result` is included on the resulting
   * `AcceptedOffer` payload — used by offers that need a user choice (e.g.
   * `plan_change` passes `{ planId }`).
   */
  onAccept: (result?: Record<string, unknown>) => Promise<void>
  onDecline: () => void
  isProcessing: boolean
  classNames?: OfferClassNames
  /**
   * Forwarded to the default `Offer` switcher so it can dispatch to per-type
   * overrides (`DiscountOffer`, `PauseOffer`, etc). Custom `Offer`
   * implementations can ignore this.
   */
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

// ─── Sub-component props ─────────────────────────────────────────────────────

export interface ReasonButtonProps {
  reason: ReasonConfig
  index: number
  isSelected: boolean
  onSelect: (id: string) => void
}

// ─── Flow state ──────────────────────────────────────────────────────────────

export interface FlowState {
  step: string
  currentStepId: string
  selectedReason: string | null
  feedback: string
  outcome: 'saved' | 'cancelled' | null
  isProcessing: boolean
  error: Error | null
  customer: DirectCustomer | null
}

// ─── Flow config ─────────────────────────────────────────────────────────────

export interface FlowConfig extends FlowCallbacks {
  appId?: string
  customer?: DirectCustomer
  subscriptions?: DirectSubscription[]
  session?: string
  apiBaseUrl?: string
  steps?: Step[]
  /**
   * Tags the session as live or test. Use `'test'` from staging so your
   * dashboard can filter out non-production traffic. Defaults to `'live'`.
   * In token mode the mode is encoded in the signed token and overrides
   * this field.
   */
  mode?: 'live' | 'test'
}

type OfferCallback = (offer: AcceptedOffer, customer: DirectCustomer | null) => Promise<void> | void
type CancelCallback = (customer: DirectCustomer | null) => Promise<void> | void

/**
 * Two kinds of callbacks, distinguished by name:
 *
 * - `handle<Type>` runs the action. When defined, it replaces whatever
 *   Churnkey would do on the server — the consumer takes responsibility.
 *   In local mode (no token), handlers are the only path that does anything.
 * - `on<Type>` is a listener that fires after the action. Side effects only —
 *   refetch state, log analytics, show a toast. Errors thrown here are
 *   swallowed; listeners can't flip the flow into an error state.
 *
 * `onAccept` is a catch-all that fires alongside the per-type listener.
 */
export interface FlowCallbacks {
  handleDiscount?: OfferCallback
  handlePause?: OfferCallback
  handlePlanChange?: OfferCallback
  handleTrialExtension?: OfferCallback
  handleCancel?: CancelCallback

  onAccept?: OfferCallback
  onDiscount?: OfferCallback
  onPause?: OfferCallback
  onPlanChange?: OfferCallback
  onTrialExtension?: OfferCallback
  onCancel?: CancelCallback
  onClose?: () => void
  onStepChange?: (step: string, prevStep: string) => void
}

// ─── CancelFlow props ────────────────────────────────────────────────────────

export interface CancelFlowProps extends FlowCallbacks {
  appId?: string
  customer?: DirectCustomer
  subscriptions?: DirectSubscription[]
  session?: string
  steps?: Step[]
  apiBaseUrl?: string
  /** See FlowConfig.mode. Ignored in token mode (the token is authoritative). */
  mode?: 'live' | 'test'
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
}
