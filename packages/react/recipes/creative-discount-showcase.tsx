/**
 * A fully custom offer type, styled after a creative-tool's own onboarding
 * screens: a fanned gallery of colorful template cards as a hero band, then
 * a bold discount headline with real before/after pricing. Built to show
 * what a custom offer type can look like when the config comes from a
 * no-code builder (discountPercent, months, planName) instead of code.
 *
 * Wire it as a custom offer type:
 *
 *   <CancelFlow
 *     ...
 *     customComponents={{ creative_discount_showcase: CreativeDiscountShowcase }}
 *   />
 *
 * offer.data holds the retention team's config: { discountPercent, months,
 * planName }. The price row reads the customer's current price from
 * `subscriptions` and computes the discounted rate — it's omitted if no
 * subscription data is available (e.g. local testing without a customer).
 *
 * Unlike confirm-with-image, this doesn't need a wider modal — the hero band
 * bleeds to the default modal's edges via the same negative-margin escape
 * from `.ck-content`'s 32/24/24 inset, but only on the top and sides, so the
 * rest of the card keeps its normal padding.
 */
import type { CustomOfferProps } from '@churnkey/react/core'

interface DiscountOfferData {
  discountPercent?: number
  months?: number
  planName?: string
}

type CardGlyph = 'lines' | 'chart' | 'image' | 'play' | 'grid'

const CARDS: { color: string; rotate: number; leftPct: number; z: number; glyph: CardGlyph }[] = [
  { color: '#8B3DFF', rotate: -16, leftPct: 16, z: 2, glyph: 'lines' },
  { color: '#00C2B8', rotate: -7, leftPct: 33, z: 3, glyph: 'chart' },
  { color: '#FF6F91', rotate: 3, leftPct: 50, z: 5, glyph: 'image' },
  { color: '#FFC93C', rotate: 11, leftPct: 67, z: 3, glyph: 'play' },
  { color: '#3D5AFE', rotate: 19, leftPct: 84, z: 2, glyph: 'grid' },
]

function formatMoney(minorUnits: number, currency: string) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase() }).format(
    minorUnits / 100,
  )
}

export function CreativeDiscountShowcase({
  offer,
  subscriptions,
  onAccept,
  onDecline,
  isProcessing,
}: CustomOfferProps) {
  const data = ((offer as { data?: DiscountOfferData }).data ?? {}) as DiscountOfferData
  const discountPercent = data.discountPercent ?? 50
  const months = data.months ?? 3
  const planName = data.planName ?? 'Pro'

  const price = subscriptions?.[0]?.items?.[0]?.price
  const currentAmount = price?.amount?.value
  const currency = price?.amount?.currency ?? 'usd'
  const discountedAmount =
    currentAmount != null ? Math.round(currentAmount * (1 - discountPercent / 100)) : undefined

  return (
    <div className="ck-step ck-step-offer">
      {/* Hero band: escapes .ck-content's top/side inset only, so the content
          below keeps normal padding. Purely decorative — hidden from
          assistive tech. */}
      <div
        aria-hidden
        style={{
          margin: '-32px -24px 0',
          height: 132,
          position: 'relative',
          overflow: 'hidden',
          background: 'linear-gradient(135deg, #F1E9FF 0%, #FFE9F1 55%, #FFF6DC 100%)',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: -30,
            left: -20,
            width: 120,
            height: 120,
            borderRadius: '50%',
            background: '#8B3DFF',
            opacity: 0.08,
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: -36,
            right: -24,
            width: 140,
            height: 140,
            borderRadius: '50%',
            background: '#00C2B8',
            opacity: 0.08,
          }}
        />
        {CARDS.map((card, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              top: '50%',
              left: `${card.leftPct}%`,
              zIndex: card.z,
              width: 52,
              height: 68,
              borderRadius: 10,
              background: card.color,
              boxShadow: '0 6px 14px -4px rgba(20, 10, 40, 0.28)',
              transform: `translate(-50%, -50%) rotate(${card.rotate}deg)`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
            }}
          >
            <CardGlyphIcon kind={card.glyph} />
          </div>
        ))}
      </div>

      <div style={{ paddingTop: 22 }}>
        <span
          style={{
            display: 'inline-block',
            fontSize: 11.5,
            fontWeight: 700,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            color: '#7526E3',
            background: '#F1E9FF',
            borderRadius: 999,
            padding: '4px 10px',
            marginBottom: 12,
          }}
        >
          Limited-time offer
        </span>

        <h2
          style={{
            fontSize: 21,
            fontWeight: 700,
            letterSpacing: '-0.015em',
            lineHeight: 1.25,
            margin: '0 0 8px',
            color: 'var(--ck-color-text)',
          }}
        >
          {discountPercent}% off {planName} for {months} {months === 1 ? 'month' : 'months'}
        </h2>

        {offer.copy.body && (
          <div style={{ fontSize: 13.5, color: 'var(--ck-color-text-secondary)', lineHeight: 1.5, marginBottom: 14 }}>
            <RichBody html={offer.copy.body} />
          </div>
        )}

        {currentAmount != null && discountedAmount != null && (
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: 8,
              marginBottom: 20,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            <span style={{ fontSize: 13, color: 'var(--ck-color-text-muted)', textDecoration: 'line-through' }}>
              {formatMoney(currentAmount, currency)}/mo
            </span>
            <span style={{ fontSize: 16, fontWeight: 700, color: '#00A99A' }}>
              {formatMoney(discountedAmount, currency)}/mo
            </span>
          </div>
        )}

        <button
          type="button"
          onClick={() => onAccept({ discountPercent, months, planName })}
          disabled={isProcessing}
          style={{
            width: '100%',
            padding: '13px 20px',
            border: 'none',
            borderRadius: 999,
            background: 'linear-gradient(135deg, #8B3DFF 0%, #FF6F91 100%)',
            color: '#fff',
            fontSize: 14.5,
            fontWeight: 700,
            fontFamily: 'inherit',
            cursor: isProcessing ? 'default' : 'pointer',
            opacity: isProcessing ? 0.7 : 1,
            transition: 'opacity var(--ck-motion-fast)',
            marginBottom: 10,
          }}
        >
          {isProcessing ? 'Applying…' : offer.copy.cta || `Get ${discountPercent}% off`}
        </button>
        <button
          type="button"
          className="ck-button-link"
          onClick={onDecline}
          style={{ width: '100%', textAlign: 'center' }}
        >
          {offer.copy.declineCta || 'No thanks'}
        </button>
      </div>
    </div>
  )
}

// offer.copy.body can carry dashboard-authored HTML (the builder's
// description editor is rich text) — render it as markup, not escaped text.
// Inlined here so this recipe has no dependency beyond @churnkey/react/core;
// in your own app, prefer the exported `RichText` component directly.
function RichBody({ html }: { html: string }) {
  // biome-ignore lint/security/noDangerouslySetInnerHtml: dashboard-authored copy, not user input — see RichText in @churnkey/react
  return <div dangerouslySetInnerHTML={{ __html: html }} />
}

function CardGlyphIcon({ kind }: { kind: CardGlyph }) {
  const common = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2 } as const
  switch (kind) {
    case 'lines':
      return (
        <svg {...common}>
          <path d="M5 7h14M5 12h14M5 17h9" strokeLinecap="round" />
        </svg>
      )
    case 'chart':
      return (
        <svg {...common}>
          <path d="M5 19V10M12 19V5M19 19v-7" strokeLinecap="round" />
        </svg>
      )
    case 'image':
      return (
        <svg {...common}>
          <rect x="4" y="5" width="16" height="14" rx="2" />
          <circle cx="9.5" cy="10" r="1.5" fill="currentColor" stroke="none" />
          <path d="M5 17l4.5-4.5a1.5 1.5 0 0 1 2.1 0L15 16l1.2-1.2a1.5 1.5 0 0 1 2.1 0L20 16.5" />
        </svg>
      )
    case 'play':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M10 8.5l6 3.5-6 3.5v-7z" fill="currentColor" stroke="none" />
        </svg>
      )
    case 'grid':
      return (
        <svg {...common}>
          <rect x="4" y="4" width="7" height="7" rx="1.5" />
          <rect x="13" y="4" width="7" height="7" rx="1.5" />
          <rect x="4" y="13" width="7" height="7" rx="1.5" />
          <rect x="13" y="13" width="7" height="7" rx="1.5" />
        </svg>
      )
  }
}
