import { RichText } from '../components/rich-text'
import { defaultMessages } from '../core/messages'
import type { CustomOfferProps } from '../core/types'

/**
 * Prebuilt renderer for custom offers whose substance lives entirely in the
 * builder copy — the customer reads the pitch and accepts or declines,
 * nothing else. One component covers any number of such offer types; the
 * per-type messaging comes from the server-resolved `offer.copy`:
 *
 *   <CancelFlow
 *     customComponents={{
 *       scheduled_transfer: PassthroughOffer,
 *       immediate_transfer: PassthroughOffer,
 *     }}
 *     onAccept={handleAccept}
 *   />
 *
 * On accept, `offer.data` (the builder-configured field values, if any)
 * passes through as the result; the merchant's handler tells offer types
 * apart via `customOfferType` on the accepted payload.
 */
export function PassthroughOffer({ offer, onAccept, onDecline, isProcessing }: CustomOfferProps) {
  const msg = defaultMessages
  // OfferDecision is a union; only the custom member carries `data`.
  const data = (offer as { data?: Record<string, unknown> }).data

  return (
    <div className="ck-step ck-step-offer">
      {offer.copy.headline && <h2 className="ck-step-title">{offer.copy.headline}</h2>}
      {offer.copy.body && <RichText as="div" html={offer.copy.body} className="ck-step-description" />}

      <div className="ck-offer-card">
        <button
          type="button"
          className="ck-button ck-button-primary"
          onClick={() => onAccept(data)}
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
