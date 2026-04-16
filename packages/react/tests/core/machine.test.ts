import { describe, expect, it, vi } from 'vitest'
import { CancelFlowMachine } from '../../src/core/machine'

const baseConfig = {
  steps: [
    {
      type: 'survey' as const,
      reasons: [
        {
          id: 'expensive',
          label: 'Too expensive',
          offer: { type: 'discount' as const, percent: 20, months: 3 },
        },
        {
          id: 'not-using',
          label: 'Not using it enough',
          offer: { type: 'pause' as const, months: 2 },
        },
        { id: 'missing', label: 'Missing features' },
      ],
    },
    { type: 'feedback' as const },
    { type: 'confirm' as const },
  ],
}

describe('CancelFlowMachine', () => {
  describe('initialization', () => {
    it('starts on survey step', () => {
      const machine = new CancelFlowMachine(baseConfig)
      expect(machine.getSnapshot().step).toBe('survey')
    })

    it('exposes reasons from config', () => {
      const machine = new CancelFlowMachine(baseConfig)
      expect(machine.reasons).toHaveLength(3)
      expect(machine.reasons[0].id).toBe('expensive')
    })

    it('has null selected reason initially', () => {
      const machine = new CancelFlowMachine(baseConfig)
      expect(machine.getSnapshot().selectedReason).toBeNull()
    })

    it('has null recommendation initially', () => {
      const machine = new CancelFlowMachine(baseConfig)
      expect(machine.getSnapshot().recommendation).toBeNull()
    })
  })

  describe('selectReason', () => {
    it('selects a reason and populates recommendation when offer exists', () => {
      const machine = new CancelFlowMachine(baseConfig)
      machine.selectReason('expensive')
      expect(machine.getSnapshot().selectedReason).toBe('expensive')
      expect(machine.getSnapshot().recommendation).not.toBeNull()
      expect(machine.getSnapshot().recommendation!.type).toBe('discount')
    })

    it('selects a reason with null recommendation when no offer', () => {
      const machine = new CancelFlowMachine(baseConfig)
      machine.selectReason('missing')
      expect(machine.getSnapshot().selectedReason).toBe('missing')
      expect(machine.getSnapshot().recommendation).toBeNull()
    })

    it('ignores unknown reason ids', () => {
      const machine = new CancelFlowMachine(baseConfig)
      machine.selectReason('nonexistent')
      expect(machine.getSnapshot().selectedReason).toBeNull()
    })

    it('generates default copy for discount offer', () => {
      const machine = new CancelFlowMachine(baseConfig)
      machine.selectReason('expensive')
      const copy = machine.getSnapshot().recommendation!.copy
      expect(copy.headline).toContain('20%')
      expect(copy.cta).toBeTruthy()
      expect(copy.declineCta).toBeTruthy()
    })

    it('generates default copy for pause offer', () => {
      const machine = new CancelFlowMachine(baseConfig)
      machine.selectReason('not-using')
      const copy = machine.getSnapshot().recommendation!.copy
      expect(copy.headline).toContain('break')
      expect(copy.body).toContain('2 months')
    })
  })

  describe('navigation - next', () => {
    it('navigates to offer step when reason has offer', () => {
      const machine = new CancelFlowMachine(baseConfig)
      machine.selectReason('expensive')
      machine.next()
      expect(machine.getSnapshot().step).toBe('offer')
    })

    it('skips offer step when reason has no offer', () => {
      const machine = new CancelFlowMachine(baseConfig)
      machine.selectReason('missing')
      machine.next()
      expect(machine.getSnapshot().step).toBe('feedback')
    })

    it('navigates from offer to feedback', () => {
      const machine = new CancelFlowMachine(baseConfig)
      machine.selectReason('expensive')
      machine.next() // -> offer
      machine.next() // -> feedback
      expect(machine.getSnapshot().step).toBe('feedback')
    })

    it('navigates from feedback to confirm', () => {
      const machine = new CancelFlowMachine(baseConfig)
      machine.selectReason('missing')
      machine.next() // -> feedback
      machine.next() // -> confirm
      expect(machine.getSnapshot().step).toBe('confirm')
    })
  })

  describe('navigation - back', () => {
    it('goes back from offer to survey', () => {
      const machine = new CancelFlowMachine(baseConfig)
      machine.selectReason('expensive')
      machine.next() // -> offer
      machine.back()
      expect(machine.getSnapshot().step).toBe('survey')
    })

    it('goes back from feedback to offer when offer exists', () => {
      const machine = new CancelFlowMachine(baseConfig)
      machine.selectReason('expensive')
      machine.next() // -> offer
      machine.next() // -> feedback
      machine.back()
      expect(machine.getSnapshot().step).toBe('offer')
    })

    it('goes back from feedback to survey when no offer', () => {
      const machine = new CancelFlowMachine(baseConfig)
      machine.selectReason('missing')
      machine.next() // -> feedback
      machine.back()
      expect(machine.getSnapshot().step).toBe('survey')
    })

    it('goes back from confirm to feedback', () => {
      const machine = new CancelFlowMachine(baseConfig)
      machine.selectReason('missing')
      machine.next() // -> feedback
      machine.next() // -> confirm
      machine.back()
      expect(machine.getSnapshot().step).toBe('feedback')
    })

    it('does nothing when on survey', () => {
      const machine = new CancelFlowMachine(baseConfig)
      machine.back()
      expect(machine.getSnapshot().step).toBe('survey')
    })
  })

  describe('skip feedback step', () => {
    const noFeedbackConfig = {
      steps: [
        {
          type: 'survey' as const,
          reasons: [{ id: 'missing', label: 'Missing features' }],
        },
        { type: 'confirm' as const },
      ],
    }

    it('skips feedback step when not in steps array', () => {
      const machine = new CancelFlowMachine(noFeedbackConfig)
      machine.selectReason('missing')
      machine.next()
      expect(machine.getSnapshot().step).toBe('confirm')
    })

    it('goes back from confirm to survey when no feedback and no offer', () => {
      const machine = new CancelFlowMachine(noFeedbackConfig)
      machine.selectReason('missing')
      machine.next() // -> confirm
      machine.back()
      expect(machine.getSnapshot().step).toBe('survey')
    })
  })

  describe('accept', () => {
    it('calls onAccept and transitions to success', async () => {
      const onAccept = vi.fn()
      const machine = new CancelFlowMachine({ ...baseConfig, onAccept })
      machine.selectReason('expensive')
      machine.next() // -> offer
      await machine.accept()

      expect(onAccept).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'discount',
          percent: 20,
          months: 3,
          reasonId: 'expensive',
        }),
      )
      expect(machine.getSnapshot().step).toBe('success')
      expect(machine.getSnapshot().outcome).toBe('saved')
    })

    it('sets isProcessing during accept', async () => {
      let resolveAccept: () => void
      const onAccept = vi.fn(
        () =>
          new Promise<void>((resolve) => {
            resolveAccept = resolve
          }),
      )
      const machine = new CancelFlowMachine({ ...baseConfig, onAccept })
      machine.selectReason('expensive')
      machine.next()

      const acceptPromise = machine.accept()
      expect(machine.getSnapshot().isProcessing).toBe(true)

      resolveAccept!()
      await acceptPromise
      expect(machine.getSnapshot().isProcessing).toBe(false)
    })

    it('handles accept errors', async () => {
      const error = new Error('Payment failed')
      const onAccept = vi.fn(() => Promise.reject(error))
      const machine = new CancelFlowMachine({ ...baseConfig, onAccept })
      machine.selectReason('expensive')
      machine.next()
      await machine.accept()

      expect(machine.getSnapshot().isProcessing).toBe(false)
      expect(machine.getSnapshot().error).toBe(error)
      expect(machine.getSnapshot().step).toBe('offer') // stays on offer
    })

    it('does nothing without a recommendation', async () => {
      const onAccept = vi.fn()
      const machine = new CancelFlowMachine({ ...baseConfig, onAccept })
      await machine.accept()
      expect(onAccept).not.toHaveBeenCalled()
    })
  })

  describe('decline', () => {
    it('moves past offer when no alternatives', () => {
      const machine = new CancelFlowMachine(baseConfig)
      machine.selectReason('expensive')
      machine.next() // -> offer
      machine.decline()
      expect(machine.getSnapshot().step).toBe('feedback')
    })
  })

  describe('cancel', () => {
    it('calls onCancel and transitions to success', async () => {
      const onCancel = vi.fn()
      const machine = new CancelFlowMachine({ ...baseConfig, onCancel })
      machine.selectReason('missing')
      machine.next() // -> feedback
      machine.next() // -> confirm
      await machine.cancel()

      expect(onCancel).toHaveBeenCalled()
      expect(machine.getSnapshot().step).toBe('success')
      expect(machine.getSnapshot().outcome).toBe('cancelled')
    })

    it('handles cancel errors', async () => {
      const error = new Error('Cancel failed')
      const onCancel = vi.fn(() => Promise.reject(error))
      const machine = new CancelFlowMachine({ ...baseConfig, onCancel })
      machine.selectReason('missing')
      machine.next()
      machine.next()
      await machine.cancel()

      expect(machine.getSnapshot().error).toBe(error)
      expect(machine.getSnapshot().step).toBe('confirm') // stays on confirm
    })
  })

  describe('feedback', () => {
    it('updates feedback text', () => {
      const machine = new CancelFlowMachine(baseConfig)
      machine.setFeedback('Great product but too expensive')
      expect(machine.getSnapshot().feedback).toBe('Great product but too expensive')
    })
  })

  describe('subscriptions', () => {
    it('notifies subscribers on state change', () => {
      const machine = new CancelFlowMachine(baseConfig)
      const listener = vi.fn()
      machine.subscribe(listener)
      machine.selectReason('expensive')
      expect(listener).toHaveBeenCalledTimes(1)
    })

    it('unsubscribes correctly', () => {
      const machine = new CancelFlowMachine(baseConfig)
      const listener = vi.fn()
      const unsub = machine.subscribe(listener)
      unsub()
      machine.selectReason('expensive')
      expect(listener).not.toHaveBeenCalled()
    })

    it('clears all listeners on destroy', () => {
      const machine = new CancelFlowMachine(baseConfig)
      const listener = vi.fn()
      machine.subscribe(listener)
      machine.destroy()
      machine.selectReason('expensive')
      expect(listener).not.toHaveBeenCalled()
    })
  })

  describe('step tracking', () => {
    it('reports correct step index', () => {
      const machine = new CancelFlowMachine(baseConfig)
      expect(machine.stepIndex).toBe(0) // survey

      machine.selectReason('expensive')
      machine.next()
      expect(machine.stepIndex).toBe(1) // offer
    })

    it('reports correct total steps with offer', () => {
      const machine = new CancelFlowMachine(baseConfig)
      machine.selectReason('expensive')
      // survey + offer + feedback + confirm = 4
      expect(machine.totalSteps).toBe(4)
    })

    it('reports correct total steps without offer', () => {
      const machine = new CancelFlowMachine(baseConfig)
      machine.selectReason('missing')
      // survey + feedback + confirm = 3
      expect(machine.totalSteps).toBe(3)
    })
  })

  describe('onStepChange callback', () => {
    it('fires on step transitions', () => {
      const onStepChange = vi.fn()
      const machine = new CancelFlowMachine({ ...baseConfig, onStepChange })
      machine.selectReason('expensive')
      machine.next()
      expect(onStepChange).toHaveBeenCalledWith('offer', 'survey')
    })
  })

  describe('getStepConfig', () => {
    it('returns step config by type', () => {
      const machine = new CancelFlowMachine({
        steps: [
          {
            type: 'survey',
            title: 'Custom title',
            reasons: [{ id: 'a', label: 'A' }],
          },
          { type: 'confirm', title: 'Custom confirm' },
        ],
      })
      const surveyConfig = machine.getStepConfig('survey')
      expect(surveyConfig?.type).toBe('survey')

      const confirmConfig = machine.getStepConfig('confirm')
      expect(confirmConfig?.type).toBe('confirm')
    })

    it('returns undefined for missing step', () => {
      const machine = new CancelFlowMachine({
        steps: [
          {
            type: 'survey',
            reasons: [{ id: 'a', label: 'A' }],
          },
          { type: 'confirm' },
        ],
      })
      expect(machine.getStepConfig('feedback')).toBeUndefined()
    })
  })

  describe('token mode initialization', () => {
    it('initializes from embed data via initializeFromEmbed', () => {
      const machine = new CancelFlowMachine({ session: 'ck_placeholder' })
      // Machine starts with empty config
      expect(machine.reasons).toHaveLength(0)

      const embedData = {
        blueprint: {
          _id: 'bp_1',
          steps: [
            {
              stepType: 'SURVEY' as const,
              enabled: true,
              header: 'Why cancel?',
              survey: {
                choices: [
                  { guid: 'r1', value: 'Too expensive' },
                  { guid: 'r2', value: 'Not using it' },
                ],
              },
            },
            {
              stepType: 'CONFIRM' as const,
              enabled: true,
            },
          ],
        },
        coupons: [],
        offerPlans: [],
        customer: null,
        sessions: [],
      }

      const mockApi = {} as any
      const mockCreds = {
        appId: 'app_1',
        customerId: 'cus_1',
        authHash: 'hash',
        mode: 'live' as const,
        issuedAt: 0,
      }

      machine.initializeFromEmbed(embedData, mockApi, mockCreds, {})

      expect(machine.reasons).toHaveLength(2)
      expect(machine.reasons[0].id).toBe('r1')
      expect(machine.reasons[0].label).toBe('Too expensive')
      expect(machine.getSnapshot().step).toBe('survey')
    })

    it('resets state when initialized from embed', () => {
      const machine = new CancelFlowMachine({
        steps: [{ type: 'survey' as const, reasons: [{ id: 'a', label: 'A' }] }, { type: 'confirm' as const }],
      })
      machine.selectReason('a')
      machine.next() // -> confirm

      const embedData = {
        blueprint: {
          _id: 'bp_1',
          steps: [
            {
              stepType: 'SURVEY' as const,
              enabled: true,
              survey: { choices: [{ guid: 'x', value: 'X' }] },
            },
            { stepType: 'CONFIRM' as const, enabled: true },
          ],
        },
        coupons: [],
        offerPlans: [],
        customer: null,
        sessions: [],
      }

      machine.initializeFromEmbed(
        embedData,
        {} as any,
        { appId: 'a', customerId: 'c', authHash: 'h', mode: 'live' as const, issuedAt: 0 },
        {},
      )

      expect(machine.getSnapshot().step).toBe('survey')
      expect(machine.getSnapshot().selectedReason).toBeNull()
    })
  })

  describe('steps + session merge', () => {
    const mockCreds = { appId: 'a', customerId: 'c', authHash: 'h', mode: 'live' as const, issuedAt: 0 }

    const embedData = {
      blueprint: {
        _id: 'bp_1',
        steps: [
          {
            stepType: 'SURVEY' as const,
            enabled: true,
            header: 'Server title',
            survey: { choices: [{ guid: 'r1', value: 'Too expensive' }] },
          },
          { stepType: 'FREEFORM' as const, enabled: true, header: 'Server feedback' },
          { stepType: 'CONFIRM' as const, enabled: true, header: 'Server confirm' },
        ],
      },
      coupons: [],
      offerPlans: [],
      customer: null,
      sessions: [],
    }

    it('local steps override server step config by type', () => {
      const machine = new CancelFlowMachine({
        session: 'ck_placeholder',
        steps: [{ type: 'confirm' as const, title: 'Are you really sure?' }],
      })
      machine.initializeFromEmbed(embedData, {} as any, mockCreds, {})

      const confirmConfig = machine.getStepConfig('confirm')
      expect(confirmConfig).toBeDefined()
      expect((confirmConfig as any).title).toBe('Are you really sure?')
    })

    it('server steps not overridden are preserved', () => {
      const machine = new CancelFlowMachine({
        session: 'ck_placeholder',
        steps: [{ type: 'confirm' as const, title: 'Custom confirm' }],
      })
      machine.initializeFromEmbed(embedData, {} as any, mockCreds, {})

      // Survey and feedback should come from server
      expect(machine.getStepConfig('survey')).toBeDefined()
      expect(machine.getStepConfig('feedback')).toBeDefined()
      expect(machine.reasons).toHaveLength(1)
      expect(machine.reasons[0].label).toBe('Too expensive')
    })

    it('local custom steps are appended after server steps', () => {
      const machine = new CancelFlowMachine({
        session: 'ck_placeholder',
        steps: [{ type: 'nps', title: 'Rate us', data: { scale: 10 } }],
      })
      machine.initializeFromEmbed(embedData, {} as any, mockCreds, {})

      const npsConfig = machine.getStepConfig('nps')
      expect(npsConfig).toBeDefined()
      expect((npsConfig as any).title).toBe('Rate us')

      // Server steps still present
      expect(machine.getStepConfig('survey')).toBeDefined()
      expect(machine.getStepConfig('confirm')).toBeDefined()
    })

    it('does not merge when only session is provided (no local steps)', () => {
      const machine = new CancelFlowMachine({ session: 'ck_placeholder' })
      machine.initializeFromEmbed(embedData, {} as any, mockCreds, {})

      const confirmConfig = machine.getStepConfig('confirm')
      expect((confirmConfig as any).title).toBe('Server confirm')
    })
  })

  describe('custom steps', () => {
    const customConfig = {
      steps: [
        {
          type: 'survey' as const,
          reasons: [
            { id: 'seats', label: 'Too many seats', offer: { type: 'change-seats', data: { minSeats: 1 } } },
            { id: 'other', label: 'Other' },
          ],
        },
        { type: 'nps', title: 'Quick question', data: { scale: 10 } },
        { type: 'feedback' as const },
        { type: 'confirm' as const },
      ],
    }

    it('navigates through custom steps in order', () => {
      const machine = new CancelFlowMachine(customConfig)
      machine.selectReason('other')
      machine.next() // survey → nps (no offer, so skip offer)
      expect(machine.getSnapshot().step).toBe('nps')

      machine.next() // nps → feedback
      expect(machine.getSnapshot().step).toBe('feedback')

      machine.next() // feedback → confirm
      expect(machine.getSnapshot().step).toBe('confirm')
    })

    it('inserts implicit offer step before custom steps when reason has offer', () => {
      const machine = new CancelFlowMachine(customConfig)
      machine.selectReason('seats')
      machine.next() // survey → offer (implicit)
      expect(machine.getSnapshot().step).toBe('offer')

      machine.next() // offer → nps
      expect(machine.getSnapshot().step).toBe('nps')
    })

    it('back navigation works through custom steps', () => {
      const machine = new CancelFlowMachine(customConfig)
      machine.selectReason('other')
      machine.next() // → nps
      machine.next() // → feedback
      machine.back() // → nps
      expect(machine.getSnapshot().step).toBe('nps')

      machine.back() // → survey
      expect(machine.getSnapshot().step).toBe('survey')
    })

    it('tracks correct step count with custom steps', () => {
      const machine = new CancelFlowMachine(customConfig)
      machine.selectReason('other')
      // survey + nps + feedback + confirm = 4
      expect(machine.totalSteps).toBe(4)
    })

    it('tracks correct step count with custom steps and offer', () => {
      const machine = new CancelFlowMachine(customConfig)
      machine.selectReason('seats')
      // survey + offer + nps + feedback + confirm = 5
      expect(machine.totalSteps).toBe(5)
    })

    it('fires onStepChange for custom step transitions', () => {
      const onStepChange = vi.fn()
      const machine = new CancelFlowMachine({ ...customConfig, onStepChange })
      machine.selectReason('other')
      machine.next()
      expect(onStepChange).toHaveBeenCalledWith('nps', 'survey')
    })
  })

  describe('custom offer types', () => {
    it('creates OfferDecision for custom offer types', () => {
      const config = {
        steps: [
          {
            type: 'survey' as const,
            reasons: [
              {
                id: 'seats',
                label: 'Too many seats',
                offer: { type: 'change-seats', data: { minSeats: 1, pricePerSeat: 10 } },
              },
            ],
          },
          { type: 'confirm' as const },
        ],
      }
      const machine = new CancelFlowMachine(config)
      machine.selectReason('seats')

      const rec = machine.getSnapshot().recommendation
      expect(rec).not.toBeNull()
      expect(rec!.type).toBe('change-seats')
      expect((rec as any).data).toEqual({ minSeats: 1, pricePerSeat: 10 })
      expect(rec!.copy.headline).toBeTruthy() // gets default copy
    })

    it('accept builds AcceptedOffer for custom types', async () => {
      const onAccept = vi.fn()
      const config = {
        steps: [
          {
            type: 'survey' as const,
            reasons: [{ id: 'seats', label: 'Too many seats', offer: { type: 'change-seats', data: { minSeats: 1 } } }],
          },
          { type: 'confirm' as const },
        ],
        onAccept,
      }
      const machine = new CancelFlowMachine(config)
      machine.selectReason('seats')
      machine.next() // → offer
      await machine.accept()

      expect(onAccept).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'change-seats',
          reasonId: 'seats',
        }),
      )
    })
  })

  describe('analytics mode (appId + customer)', () => {
    it('records session when appId and customer are present', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }))
      const machine = new CancelFlowMachine({
        appId: 'app_test',
        customer: { id: 'cus_123', email: 'test@example.com' },
        subscriptions: [
          {
            id: 'sub_456',
            start: '2024-06-01',
            status: { name: 'active' as const, currentPeriod: { start: '2025-04-01', end: '2025-05-01' } },
            items: [{ price: { id: 'price_pro', amount: { value: 2999 } } }],
          },
        ],
        steps: [
          { type: 'survey' as const, reasons: [{ id: 'expensive', label: 'Too expensive' }] },
          { type: 'confirm' as const },
        ],
      })
      machine.selectReason('expensive')
      machine.next() // → confirm
      await machine.cancel()

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/api/sessions/sdk'),
        expect.objectContaining({ method: 'POST' }),
      )

      const body = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string)
      expect(body.customer.id).toBe('cus_123')
      expect(body.customer.email).toBe('test@example.com')
      expect(body.customer.subscriptionId).toBe('sub_456')
      expect(body.customer.planId).toBe('price_pro')
      expect(body.customer.planPrice).toBe(2999)
      expect(body.canceled).toBe(true)
      expect(body.embedVersion).toBe('sdk-react')
      fetchSpy.mockRestore()
    })

    it('maps subscription billing interval to session field', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }))
      const machine = new CancelFlowMachine({
        appId: 'app_test',
        customer: { id: 'cus_123' },
        subscriptions: [
          {
            id: 'sub_456',
            start: '2024-06-01',
            status: { name: 'active' as const, currentPeriod: { start: '2025-04-01', end: '2025-05-01' } },
            items: [{ price: { id: 'price_pro', amount: { value: 9900, currency: 'eur' }, interval: 'year' } }],
          },
        ],
        steps: [{ type: 'survey' as const, reasons: [{ id: 'a', label: 'A' }] }, { type: 'confirm' as const }],
      })
      machine.selectReason('a')
      machine.next()
      await machine.cancel()

      const body = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string)
      expect(body.customer.billingInterval).toBe('YEAR')
      expect(body.customer.currency).toBe('eur')
      expect(body.customer.planPrice).toBe(9900)
      fetchSpy.mockRestore()
    })

    it('detects trial status from subscription', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }))
      const machine = new CancelFlowMachine({
        appId: 'app_test',
        customer: { id: 'cus_123' },
        subscriptions: [
          {
            id: 'sub_456',
            start: '2024-06-01',
            status: { name: 'trial' as const, trial: { start: '2025-04-01', end: '2025-04-14' } },
            items: [{ price: { id: 'price_pro', amount: { value: 2999 } } }],
          },
        ],
        steps: [{ type: 'survey' as const, reasons: [{ id: 'a', label: 'A' }] }, { type: 'confirm' as const }],
      })
      machine.selectReason('a')
      machine.next()
      await machine.cancel()

      const body = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string)
      expect(body.customer.onTrial).toBe(true)
      fetchSpy.mockRestore()
    })

    it('does not record session without appId', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }))
      const machine = new CancelFlowMachine({
        steps: [{ type: 'survey' as const, reasons: [{ id: 'a', label: 'A' }] }, { type: 'confirm' as const }],
      })
      machine.selectReason('a')
      machine.next()
      await machine.cancel()

      expect(fetchSpy).not.toHaveBeenCalled()
      fetchSpy.mockRestore()
    })

    it('records accepted offer in analytics mode', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }))
      const machine = new CancelFlowMachine({
        appId: 'app_test',
        customer: { id: 'cus_123' },
        subscriptions: [
          {
            id: 'sub_456',
            start: '2024-06-01',
            status: { name: 'active' as const, currentPeriod: { start: '2025-04-01', end: '2025-05-01' } },
            items: [{ price: { id: 'price_pro', amount: { value: 2999 } } }],
          },
        ],
        steps: [
          {
            type: 'survey' as const,
            reasons: [
              { id: 'expensive', label: 'Too expensive', offer: { type: 'discount' as const, percent: 20, months: 3 } },
            ],
          },
          { type: 'confirm' as const },
        ],
        onAccept: vi.fn(),
      })
      machine.selectReason('expensive')
      machine.next() // → offer
      await machine.accept()

      const body = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string)
      expect(body.canceled).toBe(false)
      expect(body.acceptedOffer.offerType).toBe('DISCOUNT')
      expect(body.acceptedOffer.couponAmount).toBe(20)
      fetchSpy.mockRestore()
    })
  })

  describe('customer exposure', () => {
    it('exposes customer as null in local mode', () => {
      const machine = new CancelFlowMachine(baseConfig)
      expect(machine.getSnapshot().customer).toBeNull()
    })

    it('exposes customer from embed data in token mode', () => {
      const machine = new CancelFlowMachine({ session: 'ck_placeholder' })
      const mockCustomer = { id: 'cus_123', email: 'test@example.com' }

      machine.initializeFromEmbed(
        {
          blueprint: {
            _id: 'bp_1',
            steps: [
              { stepType: 'SURVEY' as const, enabled: true, survey: { choices: [{ guid: 'r1', value: 'Test' }] } },
              { stepType: 'CONFIRM' as const, enabled: true },
            ],
          },
          coupons: [],
          offerPlans: [],
          customer: mockCustomer as any,
          sessions: [],
        },
        {} as any,
        { appId: 'a', customerId: 'c', authHash: 'h', mode: 'live' as const, issuedAt: 0 },
        {},
      )

      expect(machine.getSnapshot().customer).toEqual(mockCustomer)
    })
  })
})
