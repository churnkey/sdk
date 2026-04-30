import { formatMonthDay } from '../../../core/format'
import type { OfferDecision, OfferStepProps } from '../../../core/types'
import { cn } from '../../../core/utils'
import { RichText } from '../../rich-text'

export function DefaultTrialExtensionOffer({
  title,
  description,
  offer,
  onAccept,
  onDecline,
  isProcessing,
  classNames,
}: OfferStepProps) {
  const o = offer as OfferDecision & { days: number }
  const headline = title ?? offer.copy.headline
  const body = description ?? offer.copy.body
  const end = new Date()
  end.setDate(end.getDate() + o.days)
  const newEnd = formatMonthDay(end)

  return (
    <div className={cn('ck-step ck-step-offer', classNames?.root)}>
      {headline && <h2 className={cn('ck-step-title', classNames?.title)}>{headline}</h2>}
      {body && <RichText html={body} className={cn('ck-step-description', classNames?.description)} />}

      <div className={cn('ck-offer-card', classNames?.card)}>
        <div className="ck-offer-details ck-trial-block">
          <div className="ck-trial-badge">
            <div className="ck-trial-days">+{o.days}</div>
            <div className="ck-trial-unit">{o.days === 1 ? 'day' : 'days'}</div>
          </div>
          <div>
            <div className="ck-trial-end-label">New end date</div>
            <div className="ck-trial-end-date">{newEnd}</div>
          </div>
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
