import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { defaultMessages } from '../../src/core/messages'
import type { CustomOfferProps, DirectSubscription, OfferDecision } from '../../src/core/types'
import { PassthroughOffer } from '../../src/recipes/passthrough-offer'
import { TermExtensionOffer } from '../../src/recipes/term-extension-offer'

const copy = {
  headline: 'Stay a little longer',
  body: 'We will push your next charge out.',
  cta: 'Extend my term',
  declineCta: 'No thanks',
}

const activeSubscription: DirectSubscription = {
  id: 'sub_1',
  start: '2026-01-01T12:00:00Z',
  status: {
    name: 'active',
    currentPeriod: { start: '2026-07-01T12:00:00Z', end: '2026-08-01T12:00:00Z' },
  },
  items: [],
}

function makeProps(overrides: Partial<CustomOfferProps> = {}): CustomOfferProps {
  return {
    offer: { type: 'annual_term_extension', data: { days: 30 }, copy } as OfferDecision,
    customer: null,
    subscriptions: [activeSubscription],
    onAccept: vi.fn().mockResolvedValue(undefined),
    onDecline: vi.fn(),
    isProcessing: false,
    ...overrides,
  }
}

describe('TermExtensionOffer', () => {
  it('renders copy, the extension badge, and the new period end date', () => {
    render(<TermExtensionOffer {...makeProps()} />)
    expect(screen.getByText('Stay a little longer')).toBeInTheDocument()
    expect(screen.getByText('We will push your next charge out.')).toBeInTheDocument()
    expect(screen.getByText('+30')).toBeInTheDocument()
    // Aug 1 period end + 30 days.
    expect(screen.getByText('Aug 31')).toBeInTheDocument()
  })

  it('omits the date when no subscription period end is available', () => {
    render(<TermExtensionOffer {...makeProps({ subscriptions: [] })} />)
    expect(screen.getByText('+30')).toBeInTheDocument()
    expect(screen.queryByText(defaultMessages.offer.newEndDateLabel)).not.toBeInTheDocument()
  })

  it('passes { days } through onAccept', async () => {
    const user = userEvent.setup()
    const props = makeProps()
    render(<TermExtensionOffer {...props} />)
    await user.click(screen.getByText('Extend my term'))
    expect(props.onAccept).toHaveBeenCalledWith({ days: 30 })
  })

  it('still renders and accepts when days is missing from offer data', async () => {
    const user = userEvent.setup()
    const props = makeProps({
      offer: { type: 'annual_term_extension', data: {}, copy } as OfferDecision,
    })
    render(<TermExtensionOffer {...props} />)
    expect(screen.queryByText(/^\+/)).not.toBeInTheDocument()
    await user.click(screen.getByText('Extend my term'))
    expect(props.onAccept).toHaveBeenCalledWith(undefined)
  })

  it('disables the accept button while processing', () => {
    render(<TermExtensionOffer {...makeProps({ isProcessing: true })} />)
    expect(screen.getByText(defaultMessages.common.processing)).toBeDisabled()
  })

  it('calls onDecline from the decline link', async () => {
    const user = userEvent.setup()
    const props = makeProps()
    render(<TermExtensionOffer {...props} />)
    await user.click(screen.getByText('No thanks'))
    expect(props.onDecline).toHaveBeenCalled()
  })
})

describe('PassthroughOffer', () => {
  it('renders the server copy with accept and decline', () => {
    render(<PassthroughOffer {...makeProps()} />)
    expect(screen.getByText('Stay a little longer')).toBeInTheDocument()
    expect(screen.getByText('Extend my term')).toBeInTheDocument()
    expect(screen.getByText('No thanks')).toBeInTheDocument()
  })

  it('passes offer.data through onAccept', async () => {
    const user = userEvent.setup()
    const props = makeProps({
      offer: { type: 'scheduled_transfer', data: { plan: 'annual' }, copy } as OfferDecision,
    })
    render(<PassthroughOffer {...props} />)
    await user.click(screen.getByText('Extend my term'))
    expect(props.onAccept).toHaveBeenCalledWith({ plan: 'annual' })
  })

  it('accepts with undefined when the offer has no data', async () => {
    const user = userEvent.setup()
    const props = makeProps({
      offer: { type: 'immediate_transfer', copy } as OfferDecision,
    })
    render(<PassthroughOffer {...props} />)
    await user.click(screen.getByText('Extend my term'))
    expect(props.onAccept).toHaveBeenCalledWith(undefined)
  })

  it('calls onDecline from the decline link', async () => {
    const user = userEvent.setup()
    const props = makeProps()
    render(<PassthroughOffer {...props} />)
    await user.click(screen.getByText('No thanks'))
    expect(props.onDecline).toHaveBeenCalled()
  })
})
