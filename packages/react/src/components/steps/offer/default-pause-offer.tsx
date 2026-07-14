import { useState } from 'react'
import { formatMonthDayLong } from '../../../core/format'
import { defaultMessages } from '../../../core/messages'
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
  messages,
}: OfferStepProps) {
  const msg = messages ?? defaultMessages
  const o = offer as OfferDecision & { months: number }
  const max = Math.max(1, o.months)
  const [months, setMonths] = useState<number>(1)

  const headline = title ?? offer.copy.headline
  const body = description ?? offer.copy.body

  const resume = new Date()
  resume.setMonth(resume.getMonth() + months)
  const resumeDate = formatMonthDayLong(resume)

  return (
    <div className={cn('ck-step ck-step-offer', classNames?.root)}>
      {headline && <h2 className={cn('ck-step-title', classNames?.title)}>{headline}</h2>}
      {body && <RichText as="div" html={body} className={cn('ck-step-description', classNames?.description)} />}

      <div className={cn('ck-offer-card ck-pause-card', classNames?.card)}>
        <div className="ck-pause-eyebrow">{msg.offer.pauseEyebrow}</div>
        <div className="ck-pause-date">{resumeDate}</div>
        {max > 1 && (
          <div className={cn('ck-pause-chips', classNames?.pauseSlider)}>
            {Array.from({ length: max }, (_, i) => i + 1).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMonths(m)}
                className={cn('ck-pause-chip', m === months && 'ck-pause-chip--selected')}
                aria-pressed={m === months}
              >
                {m} {m === 1 ? msg.common.month : msg.common.months}
              </button>
            ))}
          </div>
        )}
      </div>
      <button
        type="button"
        className={cn('ck-button ck-button-primary', classNames?.acceptButton)}
        onClick={() => onAccept({ months })}
        disabled={isProcessing}
      >
        {isProcessing ? msg.common.processing : msg.offer.acceptCta.pause || offer.copy.cta}
      </button>
      <button type="button" className={cn('ck-button-link', classNames?.declineButton)} onClick={onDecline}>
        {msg.offer.declineCta || offer.copy.declineCta}
      </button>
    </div>
  )
}
