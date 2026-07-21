import { RichText } from '../components/rich-text'
import { formatMonthDay } from '../core/format'
import { defaultMessages } from '../core/messages'
import type { CustomOfferProps, DirectSubscription } from '../core/types'

/**
 * Prebuilt renderer for merchant-executed term extension offers ("delay
 * your next charge by N days"). Register it under the custom offer type
 * configured in the flow builder:
 *
 *   <CancelFlow
 *     customComponents={{ annual_term_extension: TermExtensionOffer }}
 *     onAccept={handleAccept}
 *   />
 *
 * Reads `offer.data.days` (a flow-builder field), shows the extension and
 * the resulting renewal date, and passes `{ days }` through `onAccept` so
 * the merchant's billing handler doesn't need to re-derive it.
 */
export function TermExtensionOffer({ offer, subscriptions, onAccept, onDecline, isProcessing }: CustomOfferProps) {
  const msg = defaultMessages
  // OfferDecision is a union; only the custom member carries `data`.
  const days = readDays((offer as { data?: Record<string, unknown> }).data)
  const newEnd = extendedPeriodEnd(subscriptions, days)

  return (
    <div className="ck-step ck-step-offer">
      {offer.copy.headline && <h2 className="ck-step-title">{offer.copy.headline}</h2>}
      {offer.copy.body && <RichText as="div" html={offer.copy.body} className="ck-step-description" />}

      <div className="ck-offer-card">
        {days != null && (
          // Same badge layout the built-in trial extension uses, so the
          // recipe inherits its styling wholesale.
          <div className="ck-offer-details ck-trial-block">
            <div className="ck-trial-badge">
              <div className="ck-trial-days">+{days}</div>
              <div className="ck-trial-unit">{days === 1 ? msg.common.day : msg.common.days}</div>
            </div>
            {newEnd && (
              <div>
                <div className="ck-trial-end-label">{msg.offer.newEndDateLabel}</div>
                <div className="ck-trial-end-date">{formatMonthDay(newEnd)}</div>
              </div>
            )}
          </div>
        )}
        <button
          type="button"
          className="ck-button ck-button-primary"
          onClick={() => onAccept(days != null ? { days } : undefined)}
          disabled={isProcessing}
        >
          {isProcessing ? msg.common.processing : offer.copy.cta}
        </button>
        <button type="button" className="ck-button-link" onClick={onDecline}>
          {msg.offer.declineCta || offer.copy.declineCta}
        </button>
      </div>
    </div>
  )
}

function readDays(data: Record<string, unknown> | undefined): number | null {
  const raw = data?.days
  const days = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : Number.NaN
  return Number.isFinite(days) && days > 0 ? Math.round(days) : null
}

// Term extension delays the next charge, so the new date is the current
// period end plus the extension — unlike trial extension, which counts
// from today. Null when the period end isn't known (e.g. local mode
// without subscriptions), in which case the date row is simply omitted.
function extendedPeriodEnd(subscriptions: DirectSubscription[], days: number | null): Date | null {
  if (days == null) return null
  const status = subscriptions[0]?.status
  if (!status || !('currentPeriod' in status) || !status.currentPeriod?.end) return null
  const end = status.currentPeriod.end
  const base = end instanceof Date ? new Date(end.getTime()) : new Date(end)
  if (Number.isNaN(base.getTime())) return null
  base.setDate(base.getDate() + days)
  return base
}
