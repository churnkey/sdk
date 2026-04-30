/**
 * Seat-change offer rendered as preset buckets instead of a stepper. Each
 * bucket pre-frames the choice ("right-size for a small team") — useful
 * when you want to nudge customers toward a specific number rather than
 * give them a continuous range.
 *
 * Wire it as a custom offer type:
 *
 *   <CancelFlow
 *     steps={[{
 *       type: 'survey',
 *       reasons: [
 *         { id: 'seats', label: 'Too many seats', offer: {
 *             type: 'change-seats',
 *             data: { currentSeats: 10, pricePerSeat: 10 },
 *         }},
 *       ],
 *     }, ...]}
 *     customComponents={{ 'change-seats': SeatChangeBuckets }}
 *   />
 *
 * The accepted seat count lands on `AcceptedOffer.result.seats`. Edit the
 * PRESETS function to compute different buckets from the customer's data.
 */
import type { CustomOfferProps } from '@churnkey/react/core'
import { useState } from 'react'

interface SeatChangeData {
  currentSeats: number
  pricePerSeat: number
}

function presetsFor({ currentSeats }: SeatChangeData) {
  return [
    { id: 'half', seats: Math.max(1, Math.floor(currentSeats / 2)), tagline: 'Right-size for a smaller team' },
    { id: 'core', seats: Math.max(1, Math.floor(currentSeats / 3)), tagline: 'Just the core users' },
    { id: 'solo', seats: 1, tagline: 'Solo plan' },
  ]
}

export function SeatChangeBuckets({ offer, onAccept, onDecline, isProcessing }: CustomOfferProps) {
  const data = ((offer as { data?: SeatChangeData }).data ?? { currentSeats: 10, pricePerSeat: 10 }) as SeatChangeData
  const presets = presetsFor(data)
  const [pickedId, setPickedId] = useState<string>(presets[0].id)
  const picked = presets.find((p) => p.id === pickedId) ?? presets[0]
  const newMonthly = picked.seats * data.pricePerSeat
  const savings = data.currentSeats * data.pricePerSeat - newMonthly

  return (
    <div className="ck-step ck-step-offer">
      <h2 className="ck-step-title">Pick the right team size</h2>
      <p className="ck-step-description">
        You're on {data.currentSeats} seats. We can drop you to one of these instead.
      </p>

      <div className="ck-offer-card">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
          {presets.map((p) => {
            const isSelected = p.id === pickedId
            const monthly = p.seats * data.pricePerSeat
            const save = data.currentSeats * data.pricePerSeat - monthly
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setPickedId(p.id)}
                aria-pressed={isSelected}
                style={{
                  appearance: 'none',
                  display: 'grid',
                  gridTemplateColumns: '1fr auto',
                  alignItems: 'center',
                  gap: 12,
                  padding: '12px 16px',
                  border: `1.5px solid ${isSelected ? 'var(--ck-color-primary)' : 'var(--ck-color-border)'}`,
                  background: isSelected ? 'var(--ck-color-primary-soft)' : 'var(--ck-color-surface)',
                  borderRadius: 'var(--ck-radius-md)',
                  cursor: 'pointer',
                  transition: 'all var(--ck-motion-fast)',
                  fontFamily: 'inherit',
                  textAlign: 'left',
                }}
              >
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ck-color-text)' }}>
                    {p.seats} seat{p.seats === 1 ? '' : 's'}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--ck-color-text-secondary)', marginTop: 2 }}>{p.tagline}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 14, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>${monthly}/mo</div>
                  <div
                    style={{
                      fontSize: 11,
                      color: 'var(--ck-color-success)',
                      fontWeight: 600,
                      fontVariantNumeric: 'tabular-nums',
                      marginTop: 1,
                    }}
                  >
                    save ${save}/mo
                  </div>
                </div>
              </button>
            )
          })}
        </div>

        <button
          type="button"
          className="ck-button ck-button-primary"
          onClick={() =>
            onAccept({ seats: picked.seats, previousSeats: data.currentSeats, monthlyDelta: newMonthly - data.currentSeats * data.pricePerSeat })
          }
          disabled={isProcessing}
        >
          {isProcessing ? 'Updating…' : `Reduce to ${picked.seats} seat${picked.seats === 1 ? '' : 's'} • save $${savings}/mo`}
        </button>
        <button type="button" className="ck-button-link" onClick={onDecline}>
          No thanks, cancel
        </button>
      </div>
    </div>
  )
}
