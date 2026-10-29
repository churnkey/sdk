import { formatPriceFromMinor } from '../../../core/format'
import { type CancelFlowMessages, formatMessage } from '../../../core/messages'
import type { OfferClassNames, PlanOption } from '../../../core/types'
import { cn } from '../../../core/utils'
import { Checkmark } from '../shared'

// `offer.pauseEyebrow` carries the date as `{date}`, so a language that puts
// the verb last can put the date first. An override written before the
// token existed gets the date after it, as it always did.

/** The eyebrow and date as one line. */
export function pauseResumeLine(template: string, date: string): string {
  return template.includes('{date}') ? formatMessage(template, { date }) : `${template} ${date}`
}

/** The words before and after the date, for a card that shows the date on its own line. */
export function pauseResumeParts(template: string): [string, string] {
  const at = template.indexOf('{date}')
  if (at < 0) return [template, '']
  return [template.slice(0, at).trim(), template.slice(at + '{date}'.length).trim()]
}

export function PauseChips({
  max,
  months,
  onSelect,
  classNames,
  msg,
}: {
  max: number
  months: number
  onSelect: (months: number) => void
  classNames?: OfferClassNames
  msg: CancelFlowMessages
}) {
  return (
    <div className={cn('ck-pause-chips', classNames?.pauseSlider)}>
      {Array.from({ length: max }, (_, i) => i + 1).map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => onSelect(m)}
          className={cn('ck-pause-chip', m === months && 'ck-pause-chip--selected')}
          aria-pressed={m === months}
        >
          {m} {m === 1 ? msg.common.month : msg.common.months}
        </button>
      ))}
    </div>
  )
}

export function PlanGrid({
  plans,
  currentPlanId,
  selectedPlanId,
  onSelect,
  msg,
  locale,
}: {
  plans: PlanOption[]
  currentPlanId?: string
  selectedPlanId: string | null
  onSelect: (planId: string) => void
  msg: CancelFlowMessages
  locale?: string
}) {
  return (
    <div className="ck-offer-details ck-plan-grid">
      {plans.map((plan) => {
        const interval = plan.duration?.interval ?? 'month'
        const currency = plan.amount.currency ?? 'USD'
        const isSelected = plan.id === selectedPlanId
        const isCurrent = plan.id === currentPlanId

        return (
          <button
            type="button"
            key={plan.id}
            onClick={() => onSelect(plan.id)}
            disabled={isCurrent}
            className={cn('ck-plan-card', isSelected && 'ck-plan-card--selected', isCurrent && 'ck-plan-card--current')}
            aria-pressed={isSelected}
          >
            <div className="ck-plan-name">
              {plan.name ?? plan.id}
              {isCurrent && <span className="ck-plan-current-badge">{msg.offer.currentPlanBadge}</span>}
            </div>
            {plan.tagline && <div className="ck-plan-tagline">{plan.tagline}</div>}

            <div className="ck-plan-price-row">
              <span className="ck-plan-amount">{formatPriceFromMinor(plan.amount.value, currency, locale)}</span>
              <span className="ck-plan-period">/{interval}</span>
              {plan.msrp && <span className="ck-plan-msrp">{plan.msrp}</span>}
            </div>

            {plan.features && plan.features.length > 0 && (
              <ul className="ck-plan-features">
                {plan.features.map((feature, i) => (
                  <li key={`${plan.id}-feature-${i}`} className="ck-plan-feature">
                    <span className="ck-plan-feature-check">
                      <Checkmark size={11} />
                    </span>
                    {feature}
                  </li>
                ))}
              </ul>
            )}
          </button>
        )
      })}
    </div>
  )
}
