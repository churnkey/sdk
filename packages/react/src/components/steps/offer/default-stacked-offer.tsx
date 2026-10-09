import { useState } from 'react'
import { discountPhrase, formatMonthDayLong, formatPriceFromMinor } from '../../../core/format'
import { type CancelFlowMessages, defaultMessages, formatMessage } from '../../../core/messages'
import type { OfferDecision, OfferStepProps, PlanOption } from '../../../core/types'
import { cn } from '../../../core/utils'
import { RichText } from '../../rich-text'
import { PauseChips, PlanGrid } from './offer-controls'

type PartDecision = OfferDecision & {
  months?: number
  plans?: PlanOption[]
  days?: number
  percentOff?: number
  amountOff?: number
  currency?: string
  durationInMonths?: number
  amountMinor?: number
  amountPaidMinor?: number
  netAfterRebateMinor?: number
}

// A pair of offers: one card per offer, the pause length and the plan picked inside them, one accept for both.
export function DefaultStackedOffer({
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
  const parts = (offer.stackedOffer ? [offer, offer.stackedOffer] : [offer]) as PartDecision[]
  const pause = parts.find((part) => part.type === 'pause')
  const plans = parts.find((part) => part.type === 'plan_change')?.plans
  const currentPlanId = subscriptions[0]?.items[0]?.price.id
  const [months, setMonths] = useState<number>(1)
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(
    plans?.find((p) => p.id !== currentPlanId)?.id ?? null,
  )

  const headline = title ?? offer.copy.headline
  const body = description ?? offer.copy.body
  const timing = secondOfferTiming(offer.type, msg)
  const resume = new Date()
  resume.setMonth(resume.getMonth() + months)

  const accept = () =>
    onAccept({ ...(pause && { months }), ...(plans && selectedPlanId && { planId: selectedPlanId }) })

  return (
    <div className={cn('ck-step ck-step-offer', classNames?.root)}>
      {headline && <h2 className={cn('ck-step-title', classNames?.title)}>{headline}</h2>}
      {body && <RichText as="div" html={body} className={cn('ck-step-description', classNames?.description)} />}

      {parts.map((part, i) => (
        <div key={part.decisionId ?? part.type} className={cn('ck-offer-card ck-stacked-part', classNames?.card)}>
          <div className="ck-stacked-part-title">{partTitle(part, msg)}</div>
          {part.type === 'pause' && (
            <>
              <div className="ck-stacked-part-detail">
                {msg.offer.pauseEyebrow} {formatMonthDayLong(resume)}
              </div>
              {(part.months ?? 1) > 1 && (
                <PauseChips
                  max={part.months ?? 1}
                  months={months}
                  onSelect={setMonths}
                  classNames={classNames}
                  msg={msg}
                />
              )}
            </>
          )}
          {part.type === 'plan_change' && (
            <PlanGrid
              plans={part.plans ?? []}
              currentPlanId={currentPlanId}
              selectedPlanId={selectedPlanId}
              onSelect={setSelectedPlanId}
              msg={msg}
            />
          )}
          {i === 1 && timing && <div className="ck-stacked-part-timing">{timing}</div>}
        </div>
      ))}

      <button
        type="button"
        className={cn('ck-button ck-button-primary', classNames?.acceptButton)}
        onClick={accept}
        disabled={isProcessing || Boolean(plans && !selectedPlanId)}
      >
        {isProcessing ? msg.common.processing : msg.offer.stacked.acceptCta}
      </button>
      <button type="button" className={cn('ck-button-link', classNames?.declineButton)} onClick={onDecline}>
        {msg.offer.declineCta || offer.copy.declineCta}
      </button>
    </div>
  )
}

function partTitle(part: PartDecision, msg: CancelFlowMessages): string {
  switch (part.type) {
    case 'discount':
      return discountPhrase(part)
    case 'pause':
      return msg.offer.stacked.pauseTitle
    case 'plan_change':
      return msg.offer.stacked.planChangeTitle
    case 'trial_extension':
      return formatMessage(msg.offer.stacked.trialTitle, { days: part.days ?? 0 })
    case 'rebate': {
      // Paid minus net is the rebate plus the tax refunded on it, as on the single rebate offer.
      const refund =
        part.amountPaidMinor != null && part.netAfterRebateMinor != null
          ? part.amountPaidMinor - part.netAfterRebateMinor
          : (part.amountMinor ?? 0)
      return formatMessage(msg.offer.stacked.rebateTitle, {
        amount: formatPriceFromMinor(refund, part.currency ?? 'usd'),
      })
    }
    default:
      return part.copy.headline
  }
}

function secondOfferTiming(firstType: string, msg: CancelFlowMessages): string | undefined {
  switch (firstType) {
    case 'pause':
      return msg.offer.stacked.afterPause
    case 'trial_extension':
      return msg.offer.stacked.afterTrial
    case 'plan_change':
      return msg.offer.stacked.withPlanChange
    default:
      return undefined
  }
}
