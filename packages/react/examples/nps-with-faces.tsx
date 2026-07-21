/**
 * NPS step rendered with a 5-face emoji scale instead of the usual 0–10
 * numeric grid. Lower-friction signal: fewer choices to evaluate, no
 * ambiguity about which end is good.
 *
 * Wire it as a custom step type:
 *
 *   <CancelFlow
 *     steps={[
 *       ...,
 *       { type: 'nps', title: 'How was it?' },
 *     ]}
 *     customComponents={{ nps: NpsWithFaces }}
 *   />
 *
 * The picked face id lands on `customStepResults['nps']` in the recorded
 * session. Edit the FACES array to change labels or characters.
 */
import type { CustomStepProps } from '@churnkey/react/core'
import { useState } from 'react'

const FACES = [
  { id: 1, char: '😞', label: 'Hated it' },
  { id: 2, char: '🙁', label: 'Meh' },
  { id: 3, char: '😐', label: 'OK' },
  { id: 4, char: '🙂', label: 'Liked it' },
  { id: 5, char: '😍', label: 'Loved it' },
]

export function NpsWithFaces({ step, onNext }: CustomStepProps) {
  const [picked, setPicked] = useState<number | null>(null)
  const title = step.title ?? 'How was your experience?'

  return (
    <div className="ck-step">
      <h2 className="ck-step-title">{title}</h2>
      {step.description && <p className="ck-step-description">{step.description}</p>}

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 24 }}>
        {FACES.map((f) => {
          const isSelected = f.id === picked
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => setPicked(f.id)}
              aria-label={f.label}
              aria-pressed={isSelected}
              style={{
                appearance: 'none',
                textAlign: 'center',
                flex: 1,
                padding: '12px 0',
                border: `1.5px solid ${isSelected ? 'var(--ck-color-primary)' : 'var(--ck-color-border)'}`,
                background: isSelected ? 'var(--ck-color-primary-soft)' : 'var(--ck-color-surface)',
                borderRadius: 'var(--ck-radius-md)',
                fontSize: 28,
                cursor: 'pointer',
                transition: 'all var(--ck-motion-fast)',
                fontFamily: 'inherit',
              }}
            >
              {f.char}
            </button>
          )
        })}
      </div>

      <button
        type="button"
        className="ck-button ck-button-primary"
        onClick={() => onNext({ npsFace: picked })}
        disabled={picked === null}
      >
        Continue
      </button>
    </div>
  )
}
