import { useState } from 'react'
import { formatMonthDayLong } from '../../../core/format'
import { defaultMessages } from '../../../core/messages'
import type { OfferDecision, OfferStepProps } from '../../../core/types'
import { cn } from '../../../core/utils'
import { RichText } from '../../rich-text'
import { PauseChips } from './offer-controls'

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
        {max > 1 && <PauseChips max={max} months={months} onSelect={setMonths} classNames={classNames} msg={msg} />}
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
