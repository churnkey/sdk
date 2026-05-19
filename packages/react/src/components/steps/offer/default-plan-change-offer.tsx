import { useState } from 'react'
import { formatPriceFromMinor } from '../../../core/format'
import type { OfferDecision, OfferStepProps, PlanOption } from '../../../core/types'
import { cn } from '../../../core/utils'
import { RichText } from '../../rich-text'
import { Checkmark } from '../shared'

export function DefaultPlanChangeOffer({
  title,
  description,
  subscriptions,
  offer,
  onAccept,
  onDecline,
  isProcessing,
  classNames,
}: OfferStepProps) {
  const o = offer as OfferDecision & { plans?: PlanOption[] }
  const plans = o.plans ?? []
  // Mark the customer's current plan via their first subscription's first
  // price; switching to that same plan would be a no-op so it gets disabled.
  const currentPlanId = subscriptions[0]?.items[0]?.price.id
  const initialPlanId = plans.find((p) => p.id !== currentPlanId)?.id ?? null
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(initialPlanId)
  const selectedPlan = plans.find((p) => p.id === selectedPlanId) ?? null

  const headline = title ?? offer.copy.headline
  const body = description ?? offer.copy.body
  const ctaLabel = isProcessing
    ? 'Processing...'
    : selectedPlan?.name
      ? `Switch to ${selectedPlan.name}`
      : offer.copy.cta

  return (
    <div className={cn('ck-step ck-step-offer', classNames?.root)}>
      {headline && <h2 className={cn('ck-step-title', classNames?.title)}>{headline}</h2>}
      {body && <RichText html={body} className={cn('ck-step-description', classNames?.description)} />}

      <div className={cn('ck-offer-card', classNames?.card)}>
        <div className="ck-offer-details ck-plan-grid">
          {plans.map((plan) => {
            const interval = plan.duration?.interval ?? 'month'
            const currency = plan.amount.currency ?? 'USD'
            const isSelected = plan.id === selectedPlanId
            const isCurrent = plan.id === currentPlanId

            return (
              <button
                type="button"
                key={plan.id}
                onClick={() => setSelectedPlanId(plan.id)}
                disabled={isCurrent}
                className={cn(
                  'ck-plan-card',
                  isSelected && 'ck-plan-card--selected',
                  isCurrent && 'ck-plan-card--current',
                )}
                aria-pressed={isSelected}
              >
                <div className="ck-plan-name">
                  {plan.name ?? plan.id}
                  {isCurrent && <span className="ck-plan-current-badge">Current</span>}
                </div>
                {plan.tagline && <div className="ck-plan-tagline">{plan.tagline}</div>}

                <div className="ck-plan-price-row">
                  <span className="ck-plan-amount">{formatPriceFromMinor(plan.amount.value, currency)}</span>
                  <span className="ck-plan-period">/{interval}</span>
                  {plan.msrp && <span className="ck-plan-msrp">{plan.msrp}</span>}
                </div>

                {plan.features && plan.features.length > 0 && (
                  <ul className="ck-plan-features">
                    {plan.features.map((feature, i) => (
                      <li key={`${plan.id}-feature-${i}`} className="ck-plan-feature">
                        <span className="ck-plan-feature-check">
                          <Checkmark size={11} />
                        </span>
                        {feature}
                      </li>
                    ))}
                  </ul>
                )}
              </button>
            )
          })}
        </div>
        <button
          type="button"
          className={cn('ck-button ck-button-primary', classNames?.acceptButton)}
          onClick={() => selectedPlanId && onAccept({ planId: selectedPlanId })}
          disabled={isProcessing || !selectedPlanId}
        >
          {ctaLabel}
        </button>
        <button type="button" className={cn('ck-button-link', classNames?.declineButton)} onClick={onDecline}>
          {offer.copy.declineCta}
        </button>
      </div>
    </div>
  )
}
