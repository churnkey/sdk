import { formatPriceFromMinor } from '../../../core/format'
import type { OfferDecision, OfferStepProps } from '../../../core/types'
import { cn } from '../../../core/utils'
import { RichText } from '../../rich-text'

type RebateDecision = OfferDecision & {
  amountMinor?: number
  currency?: string
  amountPaidMinor?: number
  netAfterRebateMinor?: number
}

export function DefaultRebateOffer({
  title,
  description,
  offer,
  onAccept,
  onDecline,
  isProcessing,
  classNames,
}: OfferStepProps) {
  const o = offer as RebateDecision
  const headline = title ?? offer.copy.headline
  const body = description ?? offer.copy.body
  const currency = o.currency ?? 'usd'
  const amount = o.amountMinor ?? 0
  // refund = paid - net; tax = refund - rebate. The server's net already
  // accounts for tax refunded on the rebate, so no tax means refund == rebate.
  const refund =
    o.amountPaidMinor != null && o.netAfterRebateMinor != null ? o.amountPaidMinor - o.netAfterRebateMinor : amount
  const taxRefunded = refund - amount

  return (
    <div className={cn('ck-step ck-step-offer', classNames?.root)}>
      {headline && <h2 className={cn('ck-step-title', classNames?.title)}>{headline}</h2>}
      {body && <RichText as="div" html={body} className={cn('ck-step-description', classNames?.description)} />}

      <div className={cn('ck-offer-card', classNames?.card)}>
        {/* paid / money back / net, like an invoice. Paid and net only exist in token mode. */}
        <div className="ck-offer-rebate">
          {o.amountPaidMinor != null && (
            <div className="ck-offer-rebate-row">
              <span>You paid this period</span>
              <span>{formatPriceFromMinor(o.amountPaidMinor, currency)}</span>
            </div>
          )}
          <div className="ck-offer-rebate-row ck-offer-rebate-credit">
            <span>
              Money back
              {taxRefunded > 0 && (
                <span className="ck-offer-rebate-tax"> (incl. {formatPriceFromMinor(taxRefunded, currency)} tax)</span>
              )}
            </span>
            <span>−{formatPriceFromMinor(refund, currency)}</span>
          </div>
          {o.netAfterRebateMinor != null && (
            <div className="ck-offer-rebate-row ck-offer-rebate-total">
              <span>Your net for this period</span>
              <span>{formatPriceFromMinor(o.netAfterRebateMinor, currency)}</span>
            </div>
          )}
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
