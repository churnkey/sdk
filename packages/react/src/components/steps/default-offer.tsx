import { formatPrice } from '../../core/format'
import type { OfferCardProps, OfferDecision, OfferStepProps, Plan } from '../../core/types'
import { cn } from '../../core/utils'
import { RichText } from '../rich-text'

function DefaultDiscountDetails({ offer }: { offer: OfferDecision }) {
  const o = offer as OfferDecision & { percent: number; months: number }
  return (
    <div className="ck-offer-details ck-offer-discount">
      <span className="ck-offer-badge">{o.percent}% off</span>
      <span className="ck-offer-duration">
        for {o.months} month{o.months === 1 ? '' : 's'}
      </span>
    </div>
  )
}

function DefaultPauseDetails({ offer }: { offer: OfferDecision }) {
  const o = offer as OfferDecision & { months: number }
  return (
    <div className="ck-offer-details ck-offer-pause">
      <span className="ck-offer-duration">
        Pause for up to {o.months} month{o.months === 1 ? '' : 's'}
      </span>
    </div>
  )
}

function DefaultTrialExtensionDetails({ offer }: { offer: OfferDecision }) {
  const o = offer as OfferDecision & { days: number }
  return (
    <div className="ck-offer-details ck-offer-trial">
      <span className="ck-offer-badge">
        +{o.days} day{o.days === 1 ? '' : 's'}
      </span>
      <span className="ck-offer-duration">added to your trial</span>
    </div>
  )
}

function DefaultPlanChangeGrid({ offer }: { offer: OfferDecision }) {
  const o = offer as OfferDecision & { plans?: Plan[] }
  const plans = o.plans ?? []

  if (plans.length === 0) return null

  return (
    <div className="ck-offer-details ck-plan-grid">
      {plans.map((plan) => (
        <div key={plan.id} className="ck-plan-card">
          <span className="ck-plan-name">{plan.name}</span>
          <span className="ck-plan-price">
            {formatPrice(plan.price, plan.currency)}/{plan.interval}
          </span>
          {plan.features && plan.features.length > 0 && (
            <ul className="ck-plan-features">
              {plan.features.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  )
}

function DefaultContactDetails({ offer }: { offer: OfferDecision }) {
  const url = (offer as OfferDecision & { url?: string }).url

  return (
    <div className="ck-offer-details ck-offer-contact">
      {url && (
        <a href={url} target="_blank" rel="noopener noreferrer" className="ck-offer-link">
          {offer.copy.cta}
        </a>
      )}
    </div>
  )
}

function DefaultRedirectDetails({ offer }: { offer: OfferDecision }) {
  const url = (offer as OfferDecision & { url: string }).url

  return (
    <div className="ck-offer-details ck-offer-redirect">
      <a href={url} target="_blank" rel="noopener noreferrer" className="ck-offer-link">
        {offer.copy.cta}
      </a>
    </div>
  )
}

function OfferDetails({ offer }: { offer: OfferDecision }) {
  switch (offer.type) {
    case 'discount':
      return <DefaultDiscountDetails offer={offer} />
    case 'pause':
      return <DefaultPauseDetails offer={offer} />
    case 'trial_extension':
      return <DefaultTrialExtensionDetails offer={offer} />
    case 'plan_change':
      return <DefaultPlanChangeGrid offer={offer} />
    case 'contact':
      return <DefaultContactDetails offer={offer} />
    case 'redirect':
      return <DefaultRedirectDetails offer={offer} />
    default:
      return null
  }
}

function DefaultOfferCard({ offer, onAccept, onDecline, isProcessing, classNames }: OfferCardProps) {
  const isLinkType = offer.type === 'contact' || offer.type === 'redirect'

  return (
    <div className={cn('ck-offer-card', classNames?.card)}>
      <h3 className={cn('ck-offer-headline', classNames?.headline)}>{offer.copy.headline}</h3>
      <RichText html={offer.copy.body} className={cn('ck-offer-body', classNames?.body)} />

      <OfferDetails offer={offer} />

      {!isLinkType && (
        <button
          type="button"
          className={cn('ck-button ck-button-primary', classNames?.acceptButton)}
          onClick={onAccept}
          disabled={isProcessing}
        >
          {isProcessing ? 'Processing...' : offer.copy.cta}
        </button>
      )}
      <button type="button" className={cn('ck-button-link', classNames?.declineButton)} onClick={onDecline}>
        {offer.copy.declineCta}
      </button>
    </div>
  )
}

export function DefaultOffer({ offer, onAccept, onDecline, isProcessing, classNames, components }: OfferStepProps) {
  const Card = components?.OfferCard ?? DefaultOfferCard

  return (
    <div className={cn('ck-step ck-step-offer', classNames?.root)}>
      <Card
        offer={offer}
        onAccept={onAccept}
        onDecline={onDecline}
        isProcessing={isProcessing}
        classNames={classNames}
        DiscountDetails={() => <DefaultDiscountDetails offer={offer} />}
        PauseDetails={() => <DefaultPauseDetails offer={offer} />}
        PlanChangeGrid={() => <DefaultPlanChangeGrid offer={offer} />}
        TrialExtensionDetails={() => <DefaultTrialExtensionDetails offer={offer} />}
      />
    </div>
  )
}

export { DefaultOfferCard }
