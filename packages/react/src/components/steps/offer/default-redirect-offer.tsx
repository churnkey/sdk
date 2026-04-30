import type { OfferDecision, OfferStepProps } from '../../../core/types'
import { cn } from '../../../core/utils'
import { RichText } from '../../rich-text'

export function DefaultRedirectOffer({ title, description, offer, onDecline, classNames }: OfferStepProps) {
  const url = (offer as OfferDecision & { url: string }).url
  const headline = title ?? offer.copy.headline
  const body = description ?? offer.copy.body

  return (
    <div className={cn('ck-step ck-step-offer', classNames?.root)}>
      {headline && <h2 className={cn('ck-step-title', classNames?.title)}>{headline}</h2>}
      {body && <RichText html={body} className={cn('ck-step-description', classNames?.description)} />}

      <div className={cn('ck-offer-card', classNames?.card)}>
        <div className="ck-offer-details">
          <a href={url} target="_blank" rel="noopener noreferrer" className="ck-redirect-link">
            <span>{offer.copy.cta}</span>
            <ExternalIcon />
          </a>
        </div>
        <button type="button" className={cn('ck-button-link', classNames?.declineButton)} onClick={onDecline}>
          {offer.copy.declineCta}
        </button>
      </div>
    </div>
  )
}

function ExternalIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="ck-redirect-icon"
      aria-hidden="true"
    >
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  )
}
