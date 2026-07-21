/**
 * Contact offer with a support-team avatar block. Adds a face/SLA card
 * above the action button — useful when "talk to support" is the offer
 * and you want the accept button to compete visually with save offers.
 *
 * Wire it as a per-type override:
 *
 *   <CancelFlow
 *     ...
 *     components={{ ContactOffer: ContactWithSupportCard }}
 *   />
 *
 * Edit the SUPPORT constant for your own team's info — name, SLA copy,
 * avatar character/icon.
 */
import type { OfferStepProps } from '@churnkey/react/core'

const SUPPORT = {
  name: 'Support team',
  slaCopy: 'Average reply: under 2 hours',
  avatar: '💬', // emoji or swap for an <img src=... /> with your team's photo
}

export function ContactWithSupportCard({
  title,
  description,
  offer,
  onAccept,
  onDecline,
  isProcessing,
}: OfferStepProps) {
  const headline = title ?? offer.copy.headline
  const body = description ?? offer.copy.body

  return (
    <div className="ck-step ck-step-offer">
      {headline && <h2 className="ck-step-title">{headline}</h2>}
      {body && <p className="ck-step-description">{body}</p>}

      <div className="ck-offer-card">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: 16,
            background: 'var(--ck-color-primary-soft)',
            borderRadius: 'var(--ck-radius-md)',
            marginBottom: 20,
          }}
        >
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 999,
              background: 'var(--ck-color-surface)',
              color: 'var(--ck-color-primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 20,
              flexShrink: 0,
            }}
            aria-hidden
          >
            {SUPPORT.avatar}
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ck-color-text)' }}>{SUPPORT.name}</div>
            <div style={{ fontSize: 12, color: 'var(--ck-color-text-secondary)', marginTop: 1 }}>{SUPPORT.slaCopy}</div>
          </div>
        </div>

        <button
          type="button"
          className="ck-button ck-button-primary"
          onClick={() => onAccept()}
          disabled={isProcessing}
        >
          {isProcessing ? 'Processing...' : offer.copy.cta}
        </button>
        <button type="button" className="ck-button-link" onClick={onDecline}>
          {offer.copy.declineCta}
        </button>
      </div>
    </div>
  )
}
