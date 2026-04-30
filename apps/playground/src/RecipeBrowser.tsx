import type { CSSProperties, ReactElement } from 'react'
import { useState } from 'react'
import '@churnkey/react/styles.css'

import { ConfirmWithImage } from '../../../packages/react/recipes/confirm-with-image'
import confirmWithImageSrc from '../../../packages/react/recipes/confirm-with-image.tsx?raw'
import { ContactWithSupportCard } from '../../../packages/react/recipes/contact-with-support-card'
import contactWithSupportCardSrc from '../../../packages/react/recipes/contact-with-support-card.tsx?raw'
import { NpsWithFaces } from '../../../packages/react/recipes/nps-with-faces'
import npsWithFacesSrc from '../../../packages/react/recipes/nps-with-faces.tsx?raw'
import { PlanChangeStackedRows } from '../../../packages/react/recipes/plan-change-stacked-rows'
import planChangeStackedRowsSrc from '../../../packages/react/recipes/plan-change-stacked-rows.tsx?raw'
import { SeatChangeBuckets } from '../../../packages/react/recipes/seat-change-buckets'
import seatChangeBucketsSrc from '../../../packages/react/recipes/seat-change-buckets.tsx?raw'

interface Recipe {
  id: string
  label: string
  description: string
  source: string
  preview: () => ReactElement
  // Width of the preview frame in px. Defaults to the SDK modal width
  // (440px). Recipes that target a wider modal (e.g. side-by-side layouts)
  // override it.
  previewWidth?: number
}

const RECIPES: Recipe[] = [
  {
    id: 'nps-with-faces',
    label: 'NPS with faces',
    description: 'Custom step. Five-emoji scale instead of 0–10. Lower friction, less granularity.',
    source: npsWithFacesSrc,
    preview: () => (
      <NpsWithFaces
        step={{ type: 'nps', title: 'How was your experience?' }}
        customer={null}
        onNext={noop}
        onBack={noop}
      />
    ),
  },
  {
    id: 'seat-change-buckets',
    label: 'Seat-change buckets',
    description: 'Custom offer. Preset team sizes with savings preview. Nudges toward a recommendation.',
    source: seatChangeBucketsSrc,
    preview: () => (
      <SeatChangeBuckets
        offer={{
          type: 'change-seats',
          data: { currentSeats: 10, pricePerSeat: 10 },
          copy: { headline: '', body: '', cta: '', declineCta: '' },
        }}
        customer={null}
        onAccept={noopAsync}
        onDecline={noop}
        isProcessing={false}
      />
    ),
  },
  {
    id: 'plan-change-stacked-rows',
    label: 'Plan change — stacked rows',
    description: 'Per-type override for `PlanChangeOffer`. Vertical layout for 3+ plans or long feature lists.',
    source: planChangeStackedRowsSrc,
    preview: () => (
      <PlanChangeStackedRows
        offer={{
          type: 'plan_change',
          plans: [
            {
              id: 'starter',
              name: 'Starter',
              amount: { value: 900, currency: 'USD' },
              duration: { interval: 'month' },
              tagline: 'For solo work',
              features: ['1 user', '5 projects', 'Email support'],
            },
            {
              id: 'pro',
              name: 'Pro',
              amount: { value: 2900, currency: 'USD' },
              duration: { interval: 'month' },
              tagline: 'Most popular',
              features: ['5 users', 'Unlimited projects', 'Priority support', 'Advanced analytics'],
            },
          ],
          copy: {
            headline: 'A different plan might fit',
            body: 'Pick the one that matches your usage.',
            cta: 'Switch plan',
            declineCta: 'No thanks, continue',
          },
        }}
        onAccept={noopAsync}
        onDecline={noop}
        isProcessing={false}
      />
    ),
  },
  {
    id: 'contact-with-support-card',
    label: 'Contact — support team card',
    description: 'Per-type override for `ContactOffer`. Adds an avatar/SLA block above the action button.',
    source: contactWithSupportCardSrc,
    preview: () => (
      <ContactWithSupportCard
        offer={{
          type: 'contact',
          url: 'mailto:support@example.com',
          label: 'Email support',
          copy: {
            headline: 'Talk to us first?',
            body: 'Our team would love to help resolve any issues.',
            cta: 'Email support',
            declineCta: 'No thanks, continue',
          },
        }}
        onAccept={noopAsync}
        onDecline={noop}
        isProcessing={false}
      />
    ),
  },
  {
    id: 'confirm-with-image',
    label: 'Confirm — featured image',
    description: 'Step-level override for `Confirm`. Image column + feature loss list. Higher visual weight.',
    source: confirmWithImageSrc,
    previewWidth: 640,
    preview: () => (
      <ConfirmWithImage
        title="Are you sure you want to cancel?"
        description="You'll lose these features you put to good use:"
        confirmLabel="Continue cancellation"
        goBackLabel="Keep my subscription"
        onConfirm={noopAsync}
        onGoBack={noop}
        isProcessing={false}
      />
    ),
  },
]

export function RecipeBrowser() {
  const [activeId, setActiveId] = useState(RECIPES[0].id)
  const recipe = RECIPES.find((r) => r.id === activeId) ?? RECIPES[0]

  return (
    <div
      className="ck-cancel-flow"
      style={{
        minHeight: '100vh',
        display: 'grid',
        gridTemplateColumns: '260px 1fr',
        background: 'var(--ck-color-bg)',
        fontFamily: 'var(--ck-font-family)',
      }}
    >
      <Sidebar active={activeId} onSelect={setActiveId} />
      <main style={{ padding: '40px 48px', overflow: 'auto' }}>
        <Header label={recipe.label} description={recipe.description} />
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `${recipe.previewWidth ?? 440}px 1fr`,
            gap: 24,
            alignItems: 'start',
          }}
        >
          <Preview width={recipe.previewWidth ?? 440}>{recipe.preview()}</Preview>
          <Source code={recipe.source} />
        </div>
      </main>
    </div>
  )
}

function Sidebar({ active, onSelect }: { active: string; onSelect: (id: string) => void }) {
  return (
    <aside
      style={{
        borderRight: '1px solid var(--ck-color-border)',
        padding: '32px 20px',
        background: 'var(--ck-color-surface)',
        position: 'sticky',
        top: 0,
        height: '100vh',
      }}
    >
      <div style={{ marginBottom: 24, padding: '0 12px' }}>
        <div style={ctxLabelStyle}>Churnkey SDK</div>
        <div style={{ fontSize: 18, fontWeight: 600 }}>Recipes</div>
        <div style={{ fontSize: 13, color: 'var(--ck-color-text-secondary)', marginTop: 4 }}>
          Copy-paste alternatives to the defaults.
        </div>
      </div>
      <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {RECIPES.map((r) => {
          const isActive = active === r.id
          return (
            <button
              key={r.id}
              type="button"
              onClick={() => onSelect(r.id)}
              style={{
                appearance: 'none',
                background: isActive ? 'var(--ck-color-surface-muted)' : 'transparent',
                border: 'none',
                textAlign: 'left',
                padding: '8px 12px',
                borderRadius: 'var(--ck-radius-sm)',
                cursor: 'pointer',
                fontSize: 14,
                fontWeight: isActive ? 600 : 500,
                color: isActive ? 'var(--ck-color-text)' : 'var(--ck-color-text-secondary)',
                fontFamily: 'inherit',
                transition: 'all var(--ck-motion-fast)',
              }}
            >
              {r.label}
            </button>
          )
        })}
      </nav>
    </aside>
  )
}

function Header({ label, description }: { label: string; description: string }) {
  return (
    <header style={{ marginBottom: 32, maxWidth: 720 }}>
      <h1 style={{ fontSize: 26, fontWeight: 600, letterSpacing: '-0.02em', margin: '0 0 8px' }}>{label}</h1>
      <p style={{ fontSize: 14, color: 'var(--ck-color-text-secondary)', margin: 0, lineHeight: 1.55 }}>
        {description}
      </p>
    </header>
  )
}

// Emulates .ck-modal + .ck-content so each recipe renders in the same
// constraint it would inside a real CancelFlow (32/24/24 inset, surface
// background, modal border-radius). Recipes that want the side panel to
// reach the modal edge handle their own escape from the padding.
function Preview({ children, width }: { children: ReactElement; width: number }) {
  return (
    <div
      style={{
        width,
        background: 'var(--ck-color-surface)',
        border: '1px solid var(--ck-color-border)',
        borderRadius: 'var(--ck-radius-xl)',
        boxShadow: '0 10px 15px rgba(12, 10, 9, 0.05), 0 4px 6px rgba(12, 10, 9, 0.04)',
        position: 'sticky',
        top: 40,
        overflow: 'hidden',
      }}
    >
      <div className="ck-content" style={{ padding: '32px 24px 24px' }}>
        {children}
      </div>
    </div>
  )
}

function Source({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)
  const onCopy = async () => {
    await navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <div
      style={{
        background: '#1f2937',
        color: '#e5e7eb',
        borderRadius: 'var(--ck-radius-md)',
        overflow: 'hidden',
        position: 'relative',
        fontFamily: 'var(--ck-font-mono)',
        fontSize: 12,
        lineHeight: 1.55,
      }}
    >
      <button
        type="button"
        onClick={onCopy}
        style={{
          position: 'absolute',
          top: 12,
          right: 12,
          padding: '6px 10px',
          background: copied ? 'var(--ck-color-success)' : 'rgba(255, 255, 255, 0.08)',
          color: '#fff',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          borderRadius: 'var(--ck-radius-sm)',
          fontSize: 11,
          fontWeight: 600,
          cursor: 'pointer',
          fontFamily: 'inherit',
          transition: 'background 150ms',
        }}
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
      <pre style={{ margin: 0, padding: '16px 20px', overflow: 'auto', maxHeight: '70vh' }}>
        <code>{code}</code>
      </pre>
    </div>
  )
}

const ctxLabelStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: 'var(--ck-color-text-muted)',
  marginBottom: 6,
}

const noop = () => {}
const noopAsync = async () => {}
