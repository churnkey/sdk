import { discountPhrase } from '../../../core/format'
import type { OfferDecision, OfferStepProps } from '../../../core/types'
import { cn } from '../../../core/utils'
import { RichText } from '../../rich-text'

export function DefaultDiscountOffer({
  title,
  description,
  offer,
  onAccept,
  onDecline,
  isProcessing,
  classNames,
}: OfferStepProps) {
  const o = offer as OfferDecision & {
    percentOff?: number
    amountOff?: number
    currency?: string
    durationInMonths?: number
  }
  const headline = title ?? offer.copy.headline
  const body = description ?? offer.copy.body
  const phrase = discountPhrase(o)

  return (
    <div className={cn('ck-step ck-step-offer', classNames?.root)}>
      {headline && <h2 className={cn('ck-step-title', classNames?.title)}>{headline}</h2>}
      {body && <RichText html={body} className={cn('ck-step-description', classNames?.description)} />}

      <div className={cn('ck-offer-card', classNames?.card)}>
        <div className="ck-offer-details ck-offer-discount">
          <div className="ck-offer-discount-eyebrow">Limited-time offer</div>
          <div className="ck-offer-discount-phrase">{phrase}</div>
        </div>
        <button
          type="button"
          className={cn('ck-button ck-button-primary', classNames?.acceptButton)}
          onClick={() => onAccept()}
          disabled={isProcessing}
        >
          {isProcessing ? 'Processing...' : offer.copy.cta}
        </button>
        <button type="button" className={cn('ck-button-link', classNames?.declineButton)} onClick={onDecline}>
          {offer.copy.declineCta}
        </button>
      </div>
    </div>
  )
}
