/**
 * Canva-style confirm with side panel, colored feature-loss rows, and a
 * reversed button hierarchy. Higher visual weight than the default text-only
 * confirm — use it when the cancellation moment is your last lever.
 *
 * Wire it as a step-level override:
 *
 *   <CancelFlow
 *     ...
 *     classNames={{ modal: 'wide-confirm-modal' }}
 *     components={{ Confirm: ConfirmWithImage }}
 *   />
 *
 *   .wide-confirm-modal { max-width: 640px; }
 *
 * The two-column layout needs a wider modal than the SDK default (440px) —
 * bump it via classNames as above. The component negative-margins out of
 * `.ck-content`'s 32/24/24 padding so the side panel reaches the modal
 * edge; if you've customized that padding, adjust the `margin` value below.
 *
 * Replace `<FeaturedPanel />` with an `<img>` to use a real photo. Edit
 * FEATURES and ROW_PALETTE for your own data and brand colors.
 */
import type { ConfirmStepProps } from '@churnkey/react/core'

const FEATURES: { name: string; count: number; icon: 'star' | 'shield' | 'square' }[] = [
  { name: 'Premium templates', count: 13, icon: 'star' },
  { name: 'Brand kit', count: 11, icon: 'shield' },
  { name: 'AI image generation', count: 5, icon: 'square' },
]

const ROW_PALETTE = [
  { num: '#2A5BD7', bg: '#DCE7FF' },
  { num: '#0EA5B7', bg: '#CFF1F2' },
  { num: '#F97316', bg: '#FFE5CE' },
] as const

const INFO_BANNER = 'You still have 3 days left in your free trial.'

export function ConfirmWithImage({
  title,
  description,
  confirmLabel,
  goBackLabel,
  onConfirm,
  onGoBack,
  isProcessing,
}: ConfirmStepProps) {
  return (
    <div
      // Negative-margin escape from .ck-content's 32/24/24 inset so the
      // image reaches the modal edge. The left column re-applies the inset
      // internally so its content stays aligned with other steps.
      style={{
        margin: '-32px -24px -24px',
        display: 'grid',
        gridTemplateColumns: '1fr 220px',
        minHeight: 420,
      }}
    >
      <div style={{ padding: '32px 24px 24px' }}>
        {INFO_BANNER && (
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 8,
              padding: '10px 12px',
              background: 'var(--ck-color-primary-soft)',
              borderRadius: 'var(--ck-radius-sm)',
              fontSize: 12.5,
              lineHeight: 1.45,
              marginBottom: 20,
              color: 'var(--ck-color-text)',
            }}
          >
            <InfoIcon />
            <div>{INFO_BANNER}</div>
          </div>
        )}

        <h2
          style={{
            fontSize: 22,
            fontWeight: 700,
            letterSpacing: '-0.015em',
            margin: 0,
            color: 'var(--ck-color-text)',
            lineHeight: 1.2,
            marginBottom: 8,
          }}
        >
          {title}
        </h2>
        {description && (
          <p
            style={{
              fontSize: 13.5,
              color: 'var(--ck-color-text-secondary)',
              margin: '0 0 16px',
              lineHeight: 1.5,
            }}
          >
            {description}
          </p>
        )}

        <ul
          style={{
            listStyle: 'none',
            padding: 0,
            margin: '0 0 12px',
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          {FEATURES.map((feature, i) => {
            const palette = ROW_PALETTE[i % ROW_PALETTE.length]
            return (
              <li
                key={feature.name}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '32px 1fr auto auto',
                  alignItems: 'center',
                  background: palette.bg,
                  borderRadius: 'var(--ck-radius-sm)',
                  overflow: 'hidden',
                  fontSize: 13.5,
                }}
              >
                <span
                  aria-hidden
                  style={{
                    height: 36,
                    background: palette.num,
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {i + 1}
                </span>
                <span style={{ padding: '0 12px', fontWeight: 600, color: 'var(--ck-color-text)' }}>
                  {feature.name}
                </span>
                <span
                  style={{
                    padding: '0 8px',
                    fontWeight: 700,
                    color: 'var(--ck-color-text)',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {feature.count}
                </span>
                <span style={{ padding: '0 12px 0 0', color: palette.num, display: 'inline-flex' }}>
                  <FeatureGlyph kind={feature.icon} />
                </span>
              </li>
            )
          })}
        </ul>

        <p
          style={{
            fontSize: 12.5,
            color: 'var(--ck-color-text-muted)',
            margin: '0 0 20px',
            lineHeight: 1.5,
          }}
        >
          Plus all the other time-saving features of your subscription.
        </p>

        {/* Reversed hierarchy: keep is soft, continue is the prominent action. */}
        {/* The user came here to cancel, so cancel is the on-path action; the */}
        {/* soft keep is the off-ramp. */}
        <button
          type="button"
          onClick={onGoBack}
          style={{
            width: '100%',
            padding: '12px 20px',
            background: 'var(--ck-color-surface)',
            color: 'var(--ck-color-text)',
            border: '1px solid var(--ck-color-border-strong)',
            borderRadius: 'var(--ck-radius-md)',
            fontSize: 14,
            fontWeight: 600,
            fontFamily: 'inherit',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            marginBottom: 8,
          }}
        >
          <span style={{ color: '#F59E0B', fontSize: 14 }} aria-hidden>
            ✦
          </span>
          {goBackLabel}
        </button>
        <button
          type="button"
          className="ck-button ck-button-danger"
          onClick={onConfirm}
          disabled={isProcessing}
        >
          {isProcessing ? 'Processing...' : confirmLabel}
        </button>
      </div>

      <FeaturedPanel />
    </div>
  )
}

// Soft gradient with floating shapes tinted from the row palette. Decorative
// only — ties the visual language to the feature rows. Swap for a real
// <img> if you have a brand asset.
function FeaturedPanel() {
  const [blue, teal, orange] = ROW_PALETTE
  return (
    <div
      aria-hidden
      style={{
        position: 'relative',
        overflow: 'hidden',
        background: `linear-gradient(155deg, ${blue.bg} 0%, ${teal.bg} 50%, ${orange.bg} 100%)`,
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 32,
          right: -20,
          width: 110,
          height: 110,
          borderRadius: 'var(--ck-radius-lg)',
          background: blue.num,
          opacity: 0.85,
          transform: 'rotate(-8deg)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: 110,
          left: 24,
          width: 80,
          height: 80,
          borderRadius: '50%',
          background: orange.num,
          opacity: 0.9,
        }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: 40,
          right: 28,
          width: 64,
          height: 64,
          borderRadius: 'var(--ck-radius-md)',
          background: teal.num,
          opacity: 0.85,
          transform: 'rotate(12deg)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: 100,
          left: 48,
          width: 36,
          height: 36,
          borderRadius: 'var(--ck-radius-sm)',
          background: '#fff',
          opacity: 0.75,
          transform: 'rotate(-15deg)',
        }}
      />
    </div>
  )
}

function InfoIcon() {
  return (
    <span
      aria-hidden
      style={{
        flexShrink: 0,
        marginTop: 1,
        width: 16,
        height: 16,
        borderRadius: '50%',
        background: 'var(--ck-color-primary)',
        color: '#fff',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 11,
        fontWeight: 700,
        fontStyle: 'italic',
        fontFamily: 'Georgia, serif',
      }}
    >
      i
    </span>
  )
}

function FeatureGlyph({ kind }: { kind: 'star' | 'shield' | 'square' }) {
  switch (kind) {
    case 'star':
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polygon points="12 2 15 8 22 9 17 14 18 21 12 18 6 21 7 14 2 9 9 8 12 2" />
        </svg>
      )
    case 'shield':
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 2l9 4-9 4-9-4 9-4z" />
          <path d="M3 10v6l9 4 9-4v-6" />
        </svg>
      )
    case 'square':
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="M3 8h18M8 3v18" />
        </svg>
      )
  }
}
