import { useState } from 'react'
import { formatShortDate } from '../../../core/format'
import type { OfferDecision, OfferStepProps } from '../../../core/types'
import { cn } from '../../../core/utils'
import { RichText } from '../../rich-text'

export function DefaultPauseOffer({
  title,
  description,
  offer,
  onAccept,
  onDecline,
  isProcessing,
  classNames,
}: OfferStepProps) {
  const o = offer as OfferDecision & { months: number }
  const max = Math.max(1, o.months)
  // Default to 2 months when the offer allows it — long enough to feel like
  // a real break, short enough that most subscribers come back.
  const [months, setMonths] = useState<number>(Math.min(2, max))

  const headline = title ?? offer.copy.headline
  const body = description ?? offer.copy.body
  const options = Array.from({ length: max }, (_, i) => i + 1)
  const resumeAt = new Date()
  resumeAt.setMonth(resumeAt.getMonth() + months)
  const resumeDate = formatShortDate(resumeAt)

  return (
    <div className={cn('ck-step ck-step-offer', classNames?.root)}>
      {headline && <h2 className={cn('ck-step-title', classNames?.title)}>{headline}</h2>}
      {body && <RichText html={body} className={cn('ck-step-description', classNames?.description)} />}

      <div className={cn('ck-offer-card', classNames?.card)}>
        <div className="ck-offer-details ck-offer-pause">
          <div className="ck-pause-segments" style={{ gridTemplateColumns: `repeat(${max}, 1fr)` }}>
            {options.map((m) => {
              const isSelected = m === months
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMonths(m)}
                  className={cn('ck-pause-segment', isSelected && 'ck-pause-segment--selected')}
                >
                  {m} {m === 1 ? 'month' : 'months'}
                </button>
              )
            })}
          </div>
          <div className="ck-pause-resume">
            <div>
              <div className="ck-pause-resume-label">Billing resumes</div>
              <div className="ck-pause-resume-date">{resumeDate}</div>
            </div>
            <CalendarIcon />
          </div>
        </div>
        <button
          type="button"
          className={cn('ck-button ck-button-primary', classNames?.acceptButton)}
          onClick={() => onAccept({ months })}
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

function CalendarIcon() {
  return (
    <svg
      className="ck-pause-resume-icon"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="4" width="18" height="18" rx="3" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  )
}
