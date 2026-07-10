import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CancelFlow } from '../../src/components/cancel-flow'
import type { AcceptedOffer, CustomOfferProps, Step } from '../../src/core/types'

const steps: Step[] = [
  {
    type: 'survey',
    title: 'Why are you leaving?',
    description: 'Your feedback helps us improve.',
    reasons: [
      {
        id: 'expensive',
        label: 'Too expensive',
        offer: { type: 'discount', percentOff: 20, durationInMonths: 3 },
      },
      {
        id: 'not-using',
        label: 'Not using it enough',
        offer: { type: 'pause', months: 2 },
      },
      { id: 'missing', label: 'Missing features' },
    ],
  },
  { type: 'feedback', title: 'Any feedback?' },
  {
    type: 'confirm',
    title: 'Confirm cancellation',
    description: 'Access continues until end of billing period.',
  },
]

function renderFlow(overrides: Partial<Parameters<typeof CancelFlow>[0]> = {}) {
  const onAccept = vi.fn<(offer: AcceptedOffer) => Promise<void>>().mockResolvedValue(undefined)
  const onCancel = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
  const onClose = vi.fn()

  const result = render(
    <CancelFlow steps={steps} onAccept={onAccept} onCancel={onCancel} onClose={onClose} {...overrides} />,
  )

  return { ...result, onAccept, onCancel, onClose }
}

describe('CancelFlow', () => {
  it('renders the survey step with reasons', () => {
    renderFlow()
    expect(screen.getByText('Why are you leaving?')).toBeInTheDocument()
    expect(screen.getByText('Too expensive')).toBeInTheDocument()
    expect(screen.getByText('Not using it enough')).toBeInTheDocument()
    expect(screen.getByText('Missing features')).toBeInTheDocument()
  })

  it('renders inside a modal with dialog role', () => {
    renderFlow()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('continue button is disabled until a reason is selected', () => {
    renderFlow()
    const continueBtn = screen.getByText('Continue')
    expect(continueBtn).toBeDisabled()
  })

  it('selects a reason and enables continue', async () => {
    const user = userEvent.setup()
    renderFlow()

    await user.click(screen.getByText('Too expensive'))
    expect(screen.getByText('Continue')).toBeEnabled()
  })

  it('navigates to offer step when reason has an offer', async () => {
    const user = userEvent.setup()
    renderFlow()

    await user.click(screen.getByText('Too expensive'))
    await user.click(screen.getByText('Continue'))

    // Should show the offer step with discount copy
    expect(screen.getByText('Accept offer')).toBeInTheDocument()
    expect(screen.getByText('No thanks')).toBeInTheDocument()
  })

  it('skips offer when reason has no offer', async () => {
    const user = userEvent.setup()
    renderFlow()

    await user.click(screen.getByText('Missing features'))
    await user.click(screen.getByText('Continue'))

    // Should skip to feedback since 'missing' has no offer
    expect(screen.getByText('Any feedback?')).toBeInTheDocument()
  })

  it('accepts an offer and shows success', async () => {
    const user = userEvent.setup()
    const { onAccept } = renderFlow()

    await user.click(screen.getByText('Too expensive'))
    await user.click(screen.getByText('Continue'))
    await user.click(screen.getByText('Accept offer'))

    await waitFor(() => {
      expect(screen.getByText('Welcome back!')).toBeInTheDocument()
    })
    expect(onAccept).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'discount', percentOff: 20, durationInMonths: 3 }),
      null,
    )
  })

  it('declines an offer and goes to feedback', async () => {
    const user = userEvent.setup()
    renderFlow()

    await user.click(screen.getByText('Too expensive'))
    await user.click(screen.getByText('Continue'))
    await user.click(screen.getByText('No thanks'))

    expect(screen.getByText('Any feedback?')).toBeInTheDocument()
  })

  it('completes the full cancel path', async () => {
    const user = userEvent.setup()
    const { onCancel } = renderFlow()

    await user.click(screen.getByText('Missing features'))
    await user.click(screen.getByText('Continue'))

    // Feedback step — click continue
    await user.click(screen.getByText('Continue'))

    // Confirm step
    expect(screen.getByText('Confirm cancellation')).toBeInTheDocument()
    await user.click(screen.getByText('Cancel subscription'))

    await waitFor(() => {
      expect(screen.getByText('Subscription cancelled')).toBeInTheDocument()
    })
    expect(onCancel).toHaveBeenCalled()
  })

  it('closes on Escape key', async () => {
    const user = userEvent.setup()
    const { onClose } = renderFlow()

    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()
  })

  it('closes on overlay click', async () => {
    const user = userEvent.setup()
    const { onClose } = renderFlow()

    // Click the overlay (first child of ck-cancel-flow)
    const overlay = document.querySelector('.ck-overlay')!
    await user.click(overlay)
    expect(onClose).toHaveBeenCalled()
  })

  it('applies appearance variables as CSS custom properties', () => {
    renderFlow({
      appearance: {
        variables: {
          colorPrimary: '#ff0000',
          borderRadius: '20px',
        },
      },
    })

    const root = document.querySelector('.ck-cancel-flow') as HTMLElement
    expect(root.style.getPropertyValue('--ck-color-primary')).toBe('#ff0000')
    expect(root.style.getPropertyValue('--ck-border-radius')).toBe('20px')
  })

  it('uses custom ReasonButton component', () => {
    renderFlow({
      components: {
        ReasonButton: ({ reason, isSelected, onSelect }) => (
          <button type="button" data-testid={`custom-${reason.id}`} onClick={() => onSelect(reason.id)}>
            Custom: {reason.label}
          </button>
        ),
      },
    })

    expect(screen.getByTestId('custom-expensive')).toBeInTheDocument()
    expect(screen.getByText('Custom: Too expensive')).toBeInTheDocument()
  })

  it('navigates back from confirm to feedback', async () => {
    const user = userEvent.setup()
    renderFlow()

    await user.click(screen.getByText('Missing features'))
    await user.click(screen.getByText('Continue'))
    // Skip feedback
    await user.click(screen.getByText('Continue'))
    // On confirm step
    expect(screen.getByText('Confirm cancellation')).toBeInTheDocument()

    await user.click(screen.getByText('Go back'))
    expect(screen.getByText('Any feedback?')).toBeInTheDocument()
  })

  it('shows close button in header', () => {
    renderFlow()
    expect(screen.getByLabelText('Close')).toBeInTheDocument()
  })

  // If a developer declares a custom step but
  // forgets to register a component, the fallback warns and skips via effect
  // rather than crashing the render.
  it('warns and skips a custom step with no registered component', async () => {
    const user = userEvent.setup()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const stepsWithUnregistered: Step[] = [
      { type: 'survey', reasons: [{ id: 'a', label: 'Pick me' }] },
      { type: 'nps' }, // no customComponents.nps registered
      { type: 'confirm', title: 'Confirm cancellation' },
    ]
    render(
      <CancelFlow
        steps={stepsWithUnregistered}
        onAccept={vi.fn().mockResolvedValue(undefined)}
        onCancel={vi.fn().mockResolvedValue(undefined)}
      />,
    )

    await user.click(screen.getByText('Pick me'))
    await user.click(screen.getByText('Continue'))

    // nps step is skipped; we land on confirm
    await waitFor(() => {
      expect(screen.getByText('Confirm cancellation')).toBeInTheDocument()
    })
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('No component registered for step type "nps"'))
    warn.mockRestore()
  })

  it('renders a registered custom offer component at the offer step', async () => {
    const user = userEvent.setup()
    const customSteps: Step[] = [
      {
        type: 'survey',
        reasons: [
          {
            id: 'seats',
            label: 'Too many seats',
            offer: { type: 'change-seats', data: { currentSeats: 10 } },
          },
        ],
      },
      { type: 'confirm' },
    ]

    const onAccept = vi.fn<(offer: AcceptedOffer) => Promise<void>>().mockResolvedValue(undefined)
    render(
      <CancelFlow
        steps={customSteps}
        onAccept={onAccept}
        onCancel={vi.fn().mockResolvedValue(undefined)}
        customComponents={{
          'change-seats': ({ onAccept: accept }: CustomOfferProps) => (
            <button type="button" data-testid="custom-offer" onClick={() => accept({ seats: 3 })}>
              Reduce to 3 seats
            </button>
          ),
        }}
      />,
    )

    await user.click(screen.getByText('Too many seats'))
    await user.click(screen.getByText('Continue'))
    expect(screen.getByTestId('custom-offer')).toBeInTheDocument()

    await user.click(screen.getByTestId('custom-offer'))
    await waitFor(() =>
      expect(onAccept).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'change-seats', result: { seats: 3 } }),
        null,
      ),
    )
  })

  it('renders the close button alongside step content', () => {
    renderFlow()
    // Close button is the only chrome — always present at the modal level.
    expect(screen.getByLabelText('Close')).toBeInTheDocument()
    // Body content renders below it.
    expect(screen.getByText('Too expensive')).toBeInTheDocument()
  })

  it('forwards classNames.overlay to the overlay element', () => {
    renderFlow({ classNames: { overlay: 'my-overlay-class' } })
    // The overlay is the outermost dialog wrapper. Walk up from the dialog
    // node to find it; querying by class would couple the test to the SDK's
    // own class names.
    const dialog = screen.getByRole('dialog')
    const overlay = dialog.parentElement
    expect(overlay).not.toBeNull()
    expect(overlay).toHaveClass('my-overlay-class')
  })

  it('warns and skips an unregistered custom offer type', async () => {
    const user = userEvent.setup()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const stepsWithUnknownOffer: Step[] = [
      {
        type: 'survey',
        reasons: [
          {
            id: 'pick',
            label: 'Pick me',
            // Custom offer type with no customComponents entry; the SDK
            // should warn and advance via decline rather than render blank.
            offer: { type: 'mystery-offer', data: {} },
          },
        ],
      },
      { type: 'confirm', title: 'Confirm cancellation' },
    ]
    render(
      <CancelFlow
        steps={stepsWithUnknownOffer}
        onAccept={vi.fn().mockResolvedValue(undefined)}
        onCancel={vi.fn().mockResolvedValue(undefined)}
      />,
    )

    await user.click(screen.getByText('Pick me'))
    await user.click(screen.getByText('Continue'))

    await waitFor(() => {
      expect(screen.getByText('Confirm cancellation')).toBeInTheDocument()
    })
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('No component registered for offer type "mystery-offer"'))
    warn.mockRestore()
  })

  it('renders a freeform textarea when the selected reason has freeform: true', async () => {
    const user = userEvent.setup()
    const freeformSteps: Step[] = [
      {
        type: 'survey',
        reasons: [
          { id: 'other', label: 'Other', freeform: true },
          { id: 'expensive', label: 'Too expensive' },
        ],
      },
      { type: 'confirm', title: 'Confirm cancellation' },
    ]
    render(
      <CancelFlow
        steps={freeformSteps}
        onAccept={vi.fn().mockResolvedValue(undefined)}
        onCancel={vi.fn().mockResolvedValue(undefined)}
      />,
    )

    // No textarea before any reason is selected.
    expect(screen.queryByLabelText('Additional detail')).toBeNull()

    await user.click(screen.getByText('Other'))
    const textarea = await screen.findByLabelText('Additional detail')

    await user.type(textarea, 'switching to a competitor')
    expect(textarea).toHaveValue('switching to a competitor')

    // Switching to a non-freeform reason hides the textarea and clears state.
    await user.click(screen.getByText('Too expensive'))
    expect(screen.queryByLabelText('Additional detail')).toBeNull()
  })

  it('does not render an "access continues" notice on the confirm step', () => {
    render(
      <CancelFlow
        appId="app_test"
        customer={{ id: 'cus_1' }}
        subscriptions={[
          {
            id: 'sub_1',
            start: '2024-01-01',
            status: { name: 'active', currentPeriod: { start: '2025-04-01', end: '2025-05-01' } },
            items: [{ price: { id: 'p', amount: { value: 100, currency: 'USD' } } }],
          },
        ]}
        steps={[{ type: 'confirm', title: 'Confirm cancellation' }]}
        onCancel={vi.fn().mockResolvedValue(undefined)}
      />,
    )

    // Local mode doesn't know the flow's cancel timing, so the notice must
    // stay silent — a wrong "access continues" claim contradicts the
    // merchant's setting. Token mode renders it when the server-resolved
    // timing is period-end.
    expect(screen.queryByText(/access continues until/i)).not.toBeInTheDocument()
  })

  it("marks the customer's current plan and excludes it from preselection", async () => {
    const user = userEvent.setup()
    const planChangeSteps: Step[] = [
      {
        type: 'survey',
        reasons: [
          {
            id: 'too-many-features',
            label: 'Paying for too much',
            offer: {
              type: 'plan_change',
              plans: [
                { id: 'pro', name: 'Pro', amount: { value: 2900, currency: 'USD' } },
                { id: 'starter', name: 'Starter', amount: { value: 900, currency: 'USD' } },
              ],
            },
          },
        ],
      },
      { type: 'confirm' },
    ]
    const onAccept = vi.fn<(offer: AcceptedOffer) => Promise<void>>().mockResolvedValue(undefined)
    // Customer's current plan is 'pro', via subscriptions[0].items[0].price.id.
    render(
      <CancelFlow
        steps={planChangeSteps}
        onAccept={onAccept}
        onCancel={vi.fn().mockResolvedValue(undefined)}
        appId="app_test"
        customer={{ id: 'cus_1' }}
        subscriptions={[
          {
            id: 'sub_1',
            start: '2024-01-01',
            status: { name: 'active', currentPeriod: { start: '2025-04-01', end: '2025-05-01' } },
            items: [{ price: { id: 'pro', amount: { value: 2900, currency: 'USD' } } }],
          },
        ]}
      />,
    )

    await user.click(screen.getByText('Paying for too much'))
    await user.click(screen.getByText('Continue'))

    const proCard = screen.getByText('Pro').closest('button')
    expect(proCard).toBeDisabled()
    expect(proCard?.textContent).toContain('Current')

    // Preselection skips 'pro' so the accept button targets 'starter' without
    // further interaction.
    const acceptButton = await screen.findByText('Switch to Starter')
    await user.click(acceptButton)

    await waitFor(() => {
      expect(onAccept).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'plan_change', result: { planId: 'starter' } }),
        expect.objectContaining({ id: 'cus_1' }),
      )
    })
  })
})

// ─── i18n ─────────────────────────────────────────────────────────────────────

function sessionToken(): string {
  const payload = JSON.stringify({ a: 'app_1', c: 'cus_1', h: 'hash' })
  return `ck_${btoa(payload).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`
}

function stubConfigFetch(settings: Record<string, unknown>) {
  const config = {
    blueprintId: 'bp_1',
    steps: [{ type: 'confirm', guid: 'c1', title: 'Confirm cancellation' }],
    customer: { id: 'cus_1' },
    subscriptions: [
      {
        id: 'sub_1',
        start: '2024-01-01',
        status: { name: 'active', currentPeriod: { start: '2026-06-01', end: '2026-07-01' } },
        items: [{ price: { id: 'p', amount: { value: 100, currency: 'USD' } } }],
      },
    ],
    settings: { clickToCancelEnabled: false, strictFTCComplianceEnabled: false, ...settings },
  }
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => ({
      ok: true,
      status: 200,
      json: async () => (String(url).includes('cancel-flow/config') ? config : {}),
    })),
  )
}

describe('CancelFlow i18n', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('applies message overrides to chrome strings in local mode', async () => {
    renderFlow({
      i18n: {
        locale: 'en',
        messages: { en: { common: { continue: 'Keep going' }, survey: { title: 'Tell us why' } } },
      },
      steps: [{ type: 'survey', reasons: [{ id: 'r1', label: 'Too expensive' }] }, { type: 'confirm' }],
    })
    expect(screen.getByText('Tell us why')).toBeInTheDocument()
    expect(screen.getByText('Keep going')).toBeInTheDocument()
  })

  it('renders the immediate variant of timing-aware messages in token mode', async () => {
    stubConfigFetch({ cancelAtPeriodEnd: false })
    render(
      <CancelFlow
        session={sessionToken()}
        i18n={{
          messages: {
            en: { confirm: { cta: { immediate: 'Cancel now', atPeriodEnd: 'Turn off auto-renew' } } },
          },
        }}
      />,
    )
    expect(await screen.findByText('Cancel now')).toBeInTheDocument()
    // Immediate timing must not claim continued access.
    expect(screen.queryByText(/access continues until/i)).not.toBeInTheDocument()
  })

  it('renders the period-end variant and the access notice in token mode', async () => {
    stubConfigFetch({ cancelAtPeriodEnd: true })
    render(
      <CancelFlow
        session={sessionToken()}
        i18n={{
          messages: {
            en: { confirm: { cta: { immediate: 'Cancel now', atPeriodEnd: 'Turn off auto-renew' } } },
          },
        }}
      />,
    )
    expect(await screen.findByText('Turn off auto-renew')).toBeInTheDocument()
    // The period end formats in the runner's local timezone, so the UTC
    // midnight boundary can land on either side of July 1.
    expect(screen.getByText(/Your access continues until (June 30|July 1), 2026\./)).toBeInTheDocument()
  })
})

describe('local-mode timing declaration', () => {
  const timingSteps: Step[] = [{ type: 'confirm' }]
  const i18n = {
    messages: {
      en: { confirm: { cta: { immediate: 'Cancel now', atPeriodEnd: 'Turn off auto-renew' } } },
    },
  }

  it('cancelAtPeriodEnd={false} selects the immediate variant in local mode', () => {
    renderFlow({ steps: timingSteps, cancelAtPeriodEnd: false, i18n })
    expect(screen.getByText('Cancel now')).toBeInTheDocument()
    expect(screen.queryByText(/access continues until/i)).not.toBeInTheDocument()
  })

  it('cancelAtPeriodEnd={true} selects the period-end variant and renders the notice', () => {
    // appId + customer are required for subscriptions to reach flow state —
    // the notice needs the current period end from there.
    renderFlow({
      steps: timingSteps,
      cancelAtPeriodEnd: true,
      i18n,
      appId: 'app_test',
      customer: { id: 'cus_1' },
      subscriptions: [
        {
          id: 'sub_1',
          start: '2024-01-01',
          status: { name: 'active', currentPeriod: { start: '2026-06-01', end: '2026-07-01' } },
          items: [{ price: { id: 'p', amount: { value: 100, currency: 'USD' } } }],
        },
      ],
    })
    expect(screen.getByText('Turn off auto-renew')).toBeInTheDocument()
    expect(screen.getByText(/Your access continues until (June 30|July 1), 2026\./)).toBeInTheDocument()
  })
})
