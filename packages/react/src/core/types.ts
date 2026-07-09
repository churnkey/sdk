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
}

export interface PlanChangeOffer {
  type: 'plan_change'
  plans: PlanOption[]
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

export interface RebateOffer {
  type: 'rebate'
  /** The rebate amount (pre-tax), smallest currency unit. The card is refunded this plus any tax charged on it. */
  amountMinor: number
  currency: string
  /** Gross paid on the target invoice. Server-resolved in token mode. */
  amountPaidMinor?: number
  /** amountPaidMinor minus the full refund (the rebate plus its tax). Server-resolved in token mode. */
  netAfterRebateMinor?: number
  paymentMethodBrand?: string
  paymentMethodLast4?: string
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
  | RebateOffer
export type OfferConfig = BuiltInOfferConfig | CustomOfferConfig

export type OfferDecision = OfferConfig & { copy: OfferCopy; decisionId?: string }

export interface OfferCopy {
  headline: string
  /**
   * May contain HTML when the flow was authored in the Churnkey dashboard
   * (the description editor is rich text). Render with the exported
   * `RichText` component — the same renderer the built-in steps use — rather
   * than as a text node, or the markup shows escaped. Pass `as="div"` (built-in
   * steps do) so block content like an embedded video iframe isn't hoisted out
   * of the default `<p>` wrapper.
   */
  body: string
  cta: string
  declineCta: string
}

export type AcceptedOffer = OfferConfig & {
  /** Survey reason that routed to this offer. Absent when the offer was
   *  declared as a standalone `OfferStep`. */
  reasonId?: string
  /** Payload from custom offers — whatever your component passed to
   *  `onAccept(result)`. Built-in offer types do not populate this. */
  result?: Record<string, unknown>
}

// ─── Reasons ─────────────────────────────────────────────────────────────────

export interface ReasonConfig {
  id: string
  label: string
  /**
   * When true, picking this reason reveals a text input below the reason list.
   * The typed text lands on the session as `followupResponse`. `surveyChoiceId`
   * still carries the reason's `id` and `surveyChoiceValue` still carries the
   * static `label`, so analytics groupings stay stable.
   */
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
   * Offer attached to this step. Set this to declare a standalone offer
   * step (one that isn't routed from a survey reason). `copy` is optional —
   * the SDK synthesizes default copy from the offer config when none is
   * provided, the same way it does for survey-attached offers.
   */
  offer?: OfferConfig | OfferDecision
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
  /** Optional bullet list of what the customer is giving up. Rendered between the description and the period-end notice. */
  losses?: string[]
  /** Heading above the loss list. Defaults to "You'll lose access to:". */
  lossesLabel?: string
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
  followupInput?: string
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
  lossList?: string
  lossLabel?: string
  lossItem?: string
  lossBullet?: string
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

/**
 * Typed surface for `appearance.variables`. Every key maps to a `--ck-*`
 * CSS custom property. Consumers who need a token not in this list can
 * still set the underlying CSS variable directly — these are the ones
 * exposed through the typed JS API.
 */
export interface AppearanceVariables {
  // Surfaces
  colorBackground: string
  colorSurface: string
  colorSurfaceMuted: string

  // Borders
  colorBorder: string
  colorBorderStrong: string

  // Text
  colorText: string
  colorTextSecondary: string
  colorTextMuted: string

  // Primary
  colorPrimary: string
  colorPrimaryHover: string
  colorPrimarySoft: string

  // Semantic
  colorSuccess: string
  colorSuccessSoft: string
  colorDanger: string
  colorDangerHover: string
  colorDangerSoft: string

  // Typography
  fontFamily: string
  fontFamilyMono: string
  /**
   * Display face used by step titles and other visual headlines. Defaults
   * to `fontFamily`. Set this when your brand uses a separate display face
   * (Tiempos, Canela, etc.) for headings.
   */
  fontFamilyDisplay: string
  fontSize: string
  /** Weight applied to the step title. Default `'600'`. */
  fontWeightDisplay: string
  /** Letter spacing applied to the step title. Default `'-0.015em'`. */
  letterSpacingDisplay: string

  // Geometry
  borderRadius: string
  radiusSm: string
  radiusMd: string
  radiusLg: string
  radiusXl: string

  // Elevation
  shadowModal: string
  shadowCard: string

  // Overlay
  /**
   * Color of the dim behind the modal. Defaults to a neutral translucent
   * ink. Set to `color-mix(in srgb, var(--ck-color-primary) 40%, transparent)`
   * to derive the overlay from your primary color, or any CSS color value.
   */
  overlayColor: string
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
  subscriptions: DirectSubscription[]
  onNext: (result?: Record<string, unknown>) => void
  onBack: () => void
}

export interface CustomOfferProps {
  offer: OfferDecision
  customer: DirectCustomer | null
  subscriptions: DirectSubscription[]
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
  RebateOffer?: (props: OfferStepProps) => ReactElement
}

export type CustomComponents = Record<string, ComponentType<CustomStepProps> | ComponentType<CustomOfferProps>>

// ─── Structural component props ──────────────────────────────────────────────

export interface ModalProps {
  open: boolean
  onClose: () => void
  children: ReactNode
  className?: string
  overlayClassName?: string
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
  customer: DirectCustomer | null
  subscriptions: DirectSubscription[]
  reasons: ReasonConfig[]
  selectedReason: string | null
  onSelectReason: (id: string) => void
  /** Free-text value when the selected reason has `freeform: true`. Lands on the session as `followupResponse`. */
  followupResponse: string
  /** Set the follow-up response. The SDK forwards the value to the session. */
  onFollowupResponseChange: (text: string) => void
  onNext: () => void
  classNames?: SurveyClassNames
  components?: Partial<ComponentOverrides>
}

export interface OfferStepProps {
  title?: string
  description?: string
  customer: DirectCustomer | null
  subscriptions: DirectSubscription[]
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
  customer: DirectCustomer | null
  subscriptions: DirectSubscription[]
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
  customer: DirectCustomer | null
  subscriptions: DirectSubscription[]
  losses?: string[]
  lossesLabel?: string
  confirmLabel: string
  goBackLabel: string
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
  customer: DirectCustomer | null
  subscriptions: DirectSubscription[]
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
  followupResponse: string
  feedback: string
  outcome: 'saved' | 'cancelled' | null
  isProcessing: boolean
  error: Error | null
  customer: DirectCustomer | null
  subscriptions: DirectSubscription[]
}

// ─── Flow config ─────────────────────────────────────────────────────────────

export const MODES = ['live', 'test', 'sandbox'] as const

/**
 * Environment a session runs against. `'test'` and `'sandbox'` both keep
 * sessions out of live analytics; `'sandbox'` additionally routes server-side
 * billing actions to the org's Stripe Sandbox credentials, which live under a
 * separate Stripe account ID from live/test mode.
 */
export type Mode = (typeof MODES)[number]

export interface FlowConfig extends FlowCallbacks {
  appId?: string
  customer?: DirectCustomer
  subscriptions?: DirectSubscription[]
  /**
   * Client-side attribute layer on top of provider data, e.g. usage counts
   * or entitlements only the host app knows (`{ videosCreated: 28 }`). In token mode
   * they're sent with the config request so segments can match on them when
   * picking the blueprint. In every mode they resolve as merge fields and
   * are recorded on the session, taking precedence over `customer.metadata`
   * keys. Same role as the embed's `customerAttributes`.
   */
  customerAttributes?: Record<string, unknown>
  session?: string
  apiBaseUrl?: string
  steps?: Step[]
  /**
   * Tags the session as live, test, or sandbox. Use `'test'` from staging so
   * your dashboard can filter out non-production traffic, or `'sandbox'` when
   * the org is connected to a Stripe Sandbox. Defaults to `'live'`.
   * In token mode the mode is encoded in the signed token and overrides
   * this field.
   */
  mode?: Mode
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
  handleRebate?: OfferCallback
  handleCancel?: CancelCallback

  onAccept?: OfferCallback
  onDiscount?: OfferCallback
  onPause?: OfferCallback
  onPlanChange?: OfferCallback
  onTrialExtension?: OfferCallback
  onRebate?: OfferCallback
  onCancel?: CancelCallback
  onClose?: () => void
  onStepChange?: (step: string, prevStep: string) => void
}

// ─── CancelFlow props ────────────────────────────────────────────────────────

export interface CancelFlowProps extends FlowCallbacks {
  appId?: string
  customer?: DirectCustomer
  subscriptions?: DirectSubscription[]
  /** See FlowConfig.customerAttributes. */
  customerAttributes?: Record<string, unknown>
  session?: string
  steps?: Step[]
  apiBaseUrl?: string
  /** See FlowConfig.mode. Ignored in token mode (the token is authoritative). */
  mode?: Mode
  appearance?: Appearance
  classNames?: StructuralClassNames
  components?: Partial<ComponentOverrides>
  customComponents?: CustomComponents
}
