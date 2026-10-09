import { useState } from 'react'
import { defaultMessages, formatMessage } from '../../../core/messages'
import type { OfferDecision, OfferStepProps, PlanOption } from '../../../core/types'
import { cn } from '../../../core/utils'
import { RichText } from '../../rich-text'
import { PlanGrid } from './offer-controls'

export function DefaultPlanChangeOffer({
  title,
  description,
  subscriptions,
  offer,
  onAccept,
  onDecline,
  isProcessing,
  classNames,
  messages,
}: OfferStepProps) {
  const msg = messages ?? defaultMessages
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
    ? msg.common.processing
    : selectedPlan?.name
      ? formatMessage(msg.offer.switchToCta, { planName: selectedPlan.name })
      : msg.offer.acceptCta.plan_change || offer.copy.cta

  return (
    <div className={cn('ck-step ck-step-offer', classNames?.root)}>
      {headline && <h2 className={cn('ck-step-title', classNames?.title)}>{headline}</h2>}
      {body && <RichText as="div" html={body} className={cn('ck-step-description', classNames?.description)} />}

      <div className={cn('ck-offer-card', classNames?.card)}>
        <PlanGrid
          plans={plans}
          currentPlanId={currentPlanId}
          selectedPlanId={selectedPlanId}
          onSelect={setSelectedPlanId}
          msg={msg}
        />
        <button
          type="button"
          className={cn('ck-button ck-button-primary', classNames?.acceptButton)}
          onClick={() => selectedPlanId && onAccept({ planId: selectedPlanId })}
          disabled={isProcessing || !selectedPlanId}
        >
          {ctaLabel}
        </button>
        <button type="button" className={cn('ck-button-link', classNames?.declineButton)} onClick={onDecline}>
          {msg.offer.declineCta || offer.copy.declineCta}
        </button>
      </div>
    </div>
  )
}
