import type { OfferStepProps } from '../../../core/types'
import { cn } from '../../../core/utils'
import { RichText } from '../../rich-text'

// Contact offers render no body by default — title and description carry the
// pitch, the accept button triggers the consumer's handleContact callback
// (which usually opens the offer's url). Override the slot to add an
// avatar/SLA/etc. specific to your support team.
export function DefaultContactOffer({
  title,
  description,
  offer,
  onAccept,
  onDecline,
  isProcessing,
  classNames,
}: OfferStepProps) {
  const headline = title ?? offer.copy.headline
  const body = description ?? offer.copy.body

  return (
    <div className={cn('ck-step ck-step-offer', classNames?.root)}>
      {headline && <h2 className={cn('ck-step-title', classNames?.title)}>{headline}</h2>}
      {body && <RichText html={body} className={cn('ck-step-description', classNames?.description)} />}

      <div className={cn('ck-offer-card', classNames?.card)}>
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
