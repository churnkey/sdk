/**
 * Plan-change offer rendered as stacked rows instead of side-by-side cards.
 * Better when you have 3+ plans, when feature lists are long, or when the
 * comparison-by-row reads better than comparison-by-column.
 *
 * Wire it as a per-type override:
 *
 *   <CancelFlow
 *     ...
 *     components={{ PlanChangeOffer: PlanChangeStackedRows }}
 *   />
 *
 * The selected plan id lands on `AcceptedOffer.result.planId`.
 */
import type { OfferDecision, OfferStepProps, PlanOption } from '@churnkey/react/core'
import { useState } from 'react'

// Plan amount.value is the smallest currency unit (cents for USD). For
// zero-decimal currencies (JPY, KRW...) drop the /100, or swap this for
// your project's currency formatter.
function formatPrice(minorAmount: number, currency: string) {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency, currencyDisplay: 'narrowSymbol' })
    .format(minorAmount / 100)
    .replace(/\.00$/, '')
}

export function PlanChangeStackedRows({
  title,
  description,
  offer,
  onAccept,
  onDecline,
  isProcessing,
}: OfferStepProps) {
  const o = offer as OfferDecision & { plans?: PlanOption[] }
  const plans = o.plans ?? []
  const [selectedId, setSelectedId] = useState<string | null>(plans[0]?.id ?? null)
  const selected = plans.find((p) => p.id === selectedId) ?? null

  const headline = title ?? offer.copy.headline
  const body = description ?? offer.copy.body

  return (
    <div className="ck-step ck-step-offer">
      {headline && <h2 className="ck-step-title">{headline}</h2>}
      {body && <p className="ck-step-description">{body}</p>}

      <div className="ck-offer-card">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
          {plans.map((plan) => {
            const interval = plan.duration?.interval ?? 'month'
            const currency = plan.amount.currency ?? 'USD'
            const isSelected = plan.id === selectedId
            return (
              <button
                key={plan.id}
                type="button"
                onClick={() => setSelectedId(plan.id)}
                aria-pressed={isSelected}
                style={{
                  appearance: 'none',
                  textAlign: 'left',
                  padding: 16,
                  background: 'var(--ck-color-surface)',
                  border: `1.5px solid ${isSelected ? 'var(--ck-color-primary)' : 'var(--ck-color-border)'}`,
                  borderRadius: 'var(--ck-radius-md)',
                  cursor: 'pointer',
                  transition: 'all var(--ck-motion-fast)',
                  fontFamily: 'inherit',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span
                    aria-hidden
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: 999,
                      border: `1.5px solid ${isSelected ? 'var(--ck-color-primary)' : 'var(--ck-color-border-strong)'}`,
                      background: 'var(--ck-color-surface)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    {isSelected && (
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: 999,
                          background: 'var(--ck-color-primary)',
                        }}
                      />
                    )}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                      <span style={{ fontSize: 14, fontWeight: 600 }}>{plan.name ?? plan.id}</span>
                      <span style={{ fontSize: 14, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                        {formatPrice(plan.amount.value, currency)}
                        <span style={{ fontSize: 12, color: 'var(--ck-color-text-muted)', fontWeight: 500, marginLeft: 4 }}>
                          /{interval}
                        </span>
                      </span>
                    </div>
                    {plan.tagline && (
                      <div style={{ fontSize: 12, color: 'var(--ck-color-text-secondary)', marginTop: 2 }}>
                        {plan.tagline}
                      </div>
                    )}
                    {isSelected && plan.features && plan.features.length > 0 && (
                      <ul
                        style={{
                          listStyle: 'none',
                          padding: 0,
                          margin: '12px 0 0',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 4,
                        }}
                      >
                        {plan.features.map((f, i) => (
                          <li
                            key={`${plan.id}-${i}`}
                            style={{ fontSize: 12, color: 'var(--ck-color-text-secondary)' }}
                          >
                            ✓ {f}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </button>
            )
          })}
        </div>

        <button
          type="button"
          className="ck-button ck-button-primary"
          onClick={() => selectedId && onAccept({ planId: selectedId })}
          disabled={isProcessing || !selectedId}
        >
          {isProcessing
            ? 'Processing...'
            : selected?.name
              ? `Switch to ${selected.name}`
              : offer.copy.cta}
        </button>
        <button type="button" className="ck-button-link" onClick={onDecline}>
          {offer.copy.declineCta}
        </button>
      </div>
    </div>
  )
}
