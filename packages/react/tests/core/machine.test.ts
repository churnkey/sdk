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

    it('has null currentOffer initially', () => {
      const machine = new CancelFlowMachine(baseConfig)
      expect(machine.currentOffer).toBeNull()
    })
  })

  describe('selectReason', () => {
    it('records the selected reason', () => {
      const machine = new CancelFlowMachine(baseConfig)
      machine.selectReason('expensive')
      expect(machine.getSnapshot().selectedReason).toBe('expensive')
    })

    it('ignores unknown reason ids', () => {
      const machine = new CancelFlowMachine(baseConfig)
      machine.selectReason('nonexistent')
      expect(machine.getSnapshot().selectedReason).toBeNull()
    })

    it('advances to the survey choice offer on next() when offer exists', () => {
      const machine = new CancelFlowMachine(baseConfig)
      machine.selectReason('expensive')
      machine.next()
      expect(machine.getSnapshot().step).toBe('offer')
      expect(machine.currentOffer!.type).toBe('discount')
    })

    it('generates default copy for discount offer', () => {
      const machine = new CancelFlowMachine(baseConfig)
      machine.selectReason('expensive')
      machine.next() // advance to the synthetic offer step
      const copy = machine.currentOffer!.copy
      expect(copy.headline).toContain('20%')
      expect(copy.cta).toBeTruthy()
      expect(copy.declineCta).toBeTruthy()
    })

    it('generates default copy for pause offer', () => {
      const machine = new CancelFlowMachine(baseConfig)
      machine.selectReason('not-using')
      machine.next()
      const copy = machine.currentOffer!.copy
      expect(copy.headline).toContain('break')
      expect(copy.body).toContain('2 months')
    })
  })

  describe('navigation - next', () => {
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

    it('goes back from feedback to survey (synthetic offer steps are skipped by back-nav)', () => {
      // Matches the embed's behavior: synthetic offer steps created from
      // survey-choice offers aren't part of the user-declared step order, so
      // defaultPreviousStep skips past them. Consumers wanting "back-to-offer"
      // UX would need explicit history tracking on top.
      const machine = new CancelFlowMachine(baseConfig)
      machine.selectReason('expensive')
      machine.next() // -> synthetic offer
      machine.next() // -> feedback
      machine.back()
      expect(machine.getSnapshot().step).toBe('survey')
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

    it('does nothing when no offer is on the current step', async () => {
      const onAccept = vi.fn()
      const machine = new CancelFlowMachine({ ...baseConfig, onAccept })
      await machine.accept()
      expect(onAccept).not.toHaveBeenCalled()
    })

    it('moves currentStepId onto a declared success step after accept', async () => {
      const successStep = { type: 'success' as const, guid: 'success-1', savedTitle: 'Sweet!' }
      const machine = new CancelFlowMachine({
        steps: [
          {
            type: 'survey',
            reasons: [{ id: 'r1', label: 'Too expensive', offer: { type: 'discount', percent: 10, months: 1 } }],
          },
          { type: 'confirm' },
          successStep,
        ],
      })
      machine.selectReason('r1')
      machine.next() // -> synthetic offer
      await machine.accept()

      expect(machine.getSnapshot().step).toBe('success')
      expect(machine.getSnapshot().outcome).toBe('saved')
      expect(machine.currentStep?.guid).toBe('success-1')
      expect(machine.currentStep?.savedTitle).toBe('Sweet!')
    })

    it('stays on prior step when no success step is declared', async () => {
      const machine = new CancelFlowMachine({
        steps: [
          {
            type: 'survey',
            reasons: [{ id: 'r1', label: 'Too expensive', offer: { type: 'discount', percent: 10, months: 1 } }],
          },
          { type: 'confirm' },
        ],
      })
      machine.selectReason('r1')
      machine.next() // -> synthetic offer
      const offerStepId = machine.getSnapshot().currentStepId
      await machine.accept()

      expect(machine.getSnapshot().step).toBe('success')
      expect(machine.getSnapshot().currentStepId).toBe(offerStepId)
    })

    // Pins the contract that token mode commits the action server-side BEFORE
    // the consumer's onAccept fires.
    it('token mode calls action endpoint before onAccept callback', async () => {
      const calls: string[] = []
      const onAccept = vi.fn(async () => {
        calls.push('onAccept')
      })
      const mockApi = {
        applyDiscount: vi.fn(async () => {
          calls.push('action')
        }),
        cancelSubscription: vi.fn(async () => {}),
        createSession: vi.fn(async () => {}),
      }
      const machine = new CancelFlowMachine({
        session: 'ck_placeholder',
        steps: [
          {
            type: 'survey',
            reasons: [
              {
                id: 'r1',
                label: 'Too expensive',
                offer: { type: 'discount', percent: 10, months: 1, couponId: 'c_1' },
              },
            ],
          },
          { type: 'confirm' },
        ],
        onAccept,
      })
      machine.initializeFromEmbed(
        {
          blueprint: { _id: 'bp_1', steps: [] },
          coupons: [],
          offerPlans: [],
          customer: null,
          sessions: [],
        } as any,
        mockApi as any,
        { appId: 'a', customerId: 'c', authHash: 'h', mode: 'live' as const, issuedAt: 0 },
      )
      machine.selectReason('r1')
      machine.next()
      await machine.accept()

      expect(calls).toEqual(['action', 'onAccept'])
      expect(mockApi.applyDiscount).toHaveBeenCalledWith('c_1', 'bp_1')
    })
  })

  describe('decline', () => {
    it('moves to the declared next step after the offer', () => {
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

    it('token mode calls cancelSubscription before onCancel callback', async () => {
      const calls: string[] = []
      const onCancel = vi.fn(async () => {
        calls.push('onCancel')
      })
      const mockApi = {
        cancelSubscription: vi.fn(async () => {
          calls.push('action')
        }),
        createSession: vi.fn(async () => {}),
      }
      const machine = new CancelFlowMachine({
        session: 'ck_placeholder',
        steps: [{ type: 'survey', reasons: [{ id: 'r1', label: 'Missing features' }] }, { type: 'confirm' }],
        onCancel,
      })
      machine.initializeFromEmbed(
        {
          blueprint: { _id: 'bp_1', steps: [] },
          coupons: [],
          offerPlans: [],
          customer: null,
          sessions: [],
        } as any,
        mockApi as any,
        { appId: 'a', customerId: 'c', authHash: 'h', mode: 'live' as const, issuedAt: 0 },
      )
      machine.selectReason('r1')
      machine.next()
      await machine.cancel()

      expect(calls).toEqual(['action', 'onCancel'])
      expect(mockApi.cancelSubscription).toHaveBeenCalled()
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
      // baseConfig: [survey, feedback, confirm]. Synthetic offer steps are
      // off-graph (share the survey's index) so a progress bar doesn't jitter
      // based on whether a reason had an attached offer.
      const machine = new CancelFlowMachine(baseConfig)
      expect(machine.stepIndex).toBe(0)
      machine.selectReason('expensive')
      machine.next() // -> synthetic offer (still reports survey's index)
      expect(machine.stepIndex).toBe(0)
      machine.next() // -> feedback
      expect(machine.stepIndex).toBe(1)
    })

    it('totalSteps reflects user-declared steps, not synthetic ones', () => {
      const machine = new CancelFlowMachine(baseConfig)
      // survey + feedback + confirm = 3, regardless of reason selection
      expect(machine.totalSteps).toBe(3)
      machine.selectReason('expensive')
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
    it('returns step config by type, undefined for unknown', () => {
      const machine = new CancelFlowMachine({
        steps: [
          { type: 'survey', title: 'Custom title', reasons: [{ id: 'a', label: 'A' }] },
          { type: 'confirm', title: 'Custom confirm' },
        ],
      })
      expect(machine.getStepConfig('survey')?.type).toBe('survey')
      expect(machine.getStepConfig('confirm')?.type).toBe('confirm')
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

      machine.initializeFromEmbed(embedData, mockApi, mockCreds)

      expect(machine.reasons).toHaveLength(2)
      expect(machine.reasons[0].id).toBe('r1')
      expect(machine.reasons[0].label).toBe('Too expensive')
      expect(machine.getSnapshot().step).toBe('survey')
    })

    it('exposes currentOffer from a standalone OFFER step (no preceding survey)', () => {
      const machine = new CancelFlowMachine({ session: 'ck_placeholder' })

      const embedData = {
        blueprint: {
          _id: 'bp_1',
          steps: [
            {
              stepType: 'OFFER' as const,
              enabled: true,
              header: 'Take a break?',
              description: '<p>Pause instead of cancelling.</p>',
              offer: {
                offerType: 'PAUSE' as const,
                header: 'Take a break?',
                description: '<p>Pause instead of cancelling.</p>',
                pauseConfig: { maxPauseLength: 2, pauseInterval: 'MONTH' },
              },
            },
            { stepType: 'CONFIRM' as const, enabled: true },
          ],
        },
        coupons: [],
        offerPlans: [],
        customer: null,
        sessions: [],
      }
      machine.initializeFromEmbed(embedData as never, {} as never, {
        appId: 'a',
        customerId: 'c',
        authHash: 'h',
        mode: 'live' as const,
        issuedAt: 0,
      })

      expect(machine.getSnapshot().step).toBe('offer')
      expect(machine.currentOffer).not.toBeNull()
      expect(machine.currentOffer?.type).toBe('pause')
    })

    it('exposes currentOffer when stepping into an offer step mid-flow', () => {
      // Survey → Offer (standalone) → Confirm. Reason has no attached offer,
      // so next() from survey falls through to the offer step.
      const machine = new CancelFlowMachine({ session: 'ck_placeholder' })
      machine.initializeFromEmbed(
        {
          blueprint: {
            _id: 'bp_1',
            steps: [
              {
                stepType: 'SURVEY' as const,
                enabled: true,
                survey: { choices: [{ guid: 'r1', value: 'No comment' }] },
              },
              {
                stepType: 'OFFER' as const,
                enabled: true,
                offer: {
                  offerType: 'PAUSE' as const,
                  pauseConfig: { maxPauseLength: 2, pauseInterval: 'MONTH' },
                },
              },
              { stepType: 'CONFIRM' as const, enabled: true },
            ],
          },
          coupons: [],
          offerPlans: [],
          customer: null,
          sessions: [],
        } as never,
        {} as never,
        { appId: 'a', customerId: 'c', authHash: 'h', mode: 'live' as const, issuedAt: 0 },
      )

      expect(machine.getSnapshot().step).toBe('survey')
      expect(machine.currentOffer).toBeNull()

      machine.selectReason('r1') // reason has no offer
      machine.next() // falls through to offer step

      expect(machine.getSnapshot().step).toBe('offer')
      expect(machine.currentOffer?.type).toBe('pause')
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

      machine.initializeFromEmbed(embedData, {} as any, {
        appId: 'a',
        customerId: 'c',
        authHash: 'h',
        mode: 'live' as const,
        issuedAt: 0,
      })

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
      machine.initializeFromEmbed(embedData, {} as any, mockCreds)

      const confirmConfig = machine.getStepConfig('confirm')
      expect(confirmConfig).toBeDefined()
      expect((confirmConfig as any).title).toBe('Are you really sure?')
    })

    it('server steps not overridden are preserved', () => {
      const machine = new CancelFlowMachine({
        session: 'ck_placeholder',
        steps: [{ type: 'confirm' as const, title: 'Custom confirm' }],
      })
      machine.initializeFromEmbed(embedData, {} as any, mockCreds)

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
      machine.initializeFromEmbed(embedData, {} as any, mockCreds)

      const npsConfig = machine.getStepConfig('nps')
      expect(npsConfig).toBeDefined()
      expect((npsConfig as any).title).toBe('Rate us')

      // Server steps still present
      expect(machine.getStepConfig('survey')).toBeDefined()
      expect(machine.getStepConfig('confirm')).toBeDefined()
    })

    it('does not merge when only session is provided (no local steps)', () => {
      const machine = new CancelFlowMachine({ session: 'ck_placeholder' })
      machine.initializeFromEmbed(embedData, {} as any, mockCreds)

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

    it('totalSteps reflects declared steps (synthetic offers excluded)', () => {
      const machine = new CancelFlowMachine(customConfig)
      machine.selectReason('seats')
      // survey + nps + feedback + confirm = 4. The synthetic offer step
      // created for the 'seats' reason isn't part of the user-declared order.
      expect(machine.totalSteps).toBe(4)
    })

    it('fires onStepChange for custom step transitions', () => {
      const onStepChange = vi.fn()
      const machine = new CancelFlowMachine({ ...customConfig, onStepChange })
      machine.selectReason('other')
      machine.next()
      expect(onStepChange).toHaveBeenCalledWith('nps', 'survey')
    })

    it('captures custom step results via next()', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }))
      const machine = new CancelFlowMachine({
        appId: 'app_test',
        customer: { id: 'cus_123' },
        steps: [
          { type: 'survey' as const, reasons: [{ id: 'a', label: 'A' }] },
          { type: 'nps', title: 'Rate us', data: { scale: 10 } },
          { type: 'confirm' as const },
        ],
      })
      machine.selectReason('a')
      machine.next() // survey → nps
      machine.next({ npsScore: 8 }) // nps → confirm (with result)
      await machine.cancel()

      const body = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string)
      expect(body.customStepResults).toEqual({ nps: { npsScore: 8 } })
      fetchSpy.mockRestore()
    })

    it('ignores non-plain-object results (e.g. events passed via onClick={next})', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }))
      const machine = new CancelFlowMachine({
        appId: 'app_test',
        customer: { id: 'cus_123' },
        steps: [{ type: 'survey' as const, reasons: [{ id: 'a', label: 'A' }] }, { type: 'confirm' as const }],
      })
      machine.selectReason('a')
      // Native DOM event (React 16 / non-React callers)
      machine.next(new Event('click') as unknown as Record<string, unknown>)
      // Class instance — mirrors React 17+ SyntheticEvent, which is NOT instanceof Event
      class SyntheticEvent {
        target = {}
      }
      machine.next(new SyntheticEvent() as unknown as Record<string, unknown>)
      await machine.cancel()

      // Payload must serialize cleanly — no circular structure from an event leaking in
      const body = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string)
      expect(body.customStepResults).toBeUndefined()
      fetchSpy.mockRestore()
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
      machine.next() // advance to the synthetic custom offer step

      const rec = machine.currentOffer
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

    it('ignores non-plain-object accept(result) (e.g. onClick={accept} passing a MouseEvent)', async () => {
      const onAccept = vi.fn()
      const machine = new CancelFlowMachine({
        steps: [
          {
            type: 'survey' as const,
            reasons: [{ id: 'a', label: 'A', offer: { type: 'discount' as const, percent: 20, months: 3 } }],
          },
          { type: 'confirm' as const },
        ],
        onAccept,
      })
      machine.selectReason('a')
      machine.next()
      // Class-instance with a non-Object prototype — same shape isPlainObject
      // rejects when a React SyntheticEvent is accidentally passed.
      class FakeSyntheticEvent {
        nativeEvent = {}
        preventDefault() {}
      }
      await machine.accept(new FakeSyntheticEvent() as unknown as Record<string, unknown>)

      const acceptedOffer = onAccept.mock.calls[0][0]
      expect(acceptedOffer.result).toBeUndefined()
    })

    it('forwards accept(result) through to onAccept as acceptedOffer.result', async () => {
      const onAccept = vi.fn()
      const machine = new CancelFlowMachine({
        steps: [
          {
            type: 'survey' as const,
            reasons: [{ id: 'seats', label: 'Too many seats', offer: { type: 'change-seats', data: {} } }],
          },
          { type: 'confirm' as const },
        ],
        onAccept,
      })
      machine.selectReason('seats')
      machine.next() // → offer
      await machine.accept({ seats: 3, previousSeats: 10 })

      expect(onAccept).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'change-seats',
          reasonId: 'seats',
          result: { seats: 3, previousSeats: 10 },
        }),
      )
    })

    it('omits result field on acceptedOffer when accept() is called without args', async () => {
      const onAccept = vi.fn()
      const machine = new CancelFlowMachine({
        steps: [
          {
            type: 'survey' as const,
            reasons: [{ id: 'a', label: 'A', offer: { type: 'discount' as const, percent: 20, months: 3 } }],
          },
          { type: 'confirm' as const },
        ],
        onAccept,
      })
      machine.selectReason('a')
      machine.next()
      await machine.accept()

      const acceptedOffer = onAccept.mock.calls[0][0]
      expect(acceptedOffer.result).toBeUndefined()
    })
  })

  describe('analytics mode (appId + customer)', () => {
    it('records session with only appId and customer.id (no subscriptions)', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }))
      const machine = new CancelFlowMachine({
        appId: 'app_test',
        customer: { id: 'cus_123' },
        steps: [{ type: 'survey' as const, reasons: [{ id: 'a', label: 'A' }] }, { type: 'confirm' as const }],
      })
      machine.selectReason('a')
      machine.next()
      await machine.cancel()

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/api/sessions/sdk'),
        expect.objectContaining({ method: 'POST' }),
      )
      const body = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string)
      expect(body.customer.id).toBe('cus_123')
      expect(body.customer.currency).toBeUndefined()
      expect(body.customer.onTrial).toBeUndefined()
      expect(body.canceled).toBe(true)
      fetchSpy.mockRestore()
    })

    it('records abort session when modal is closed before completion', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }))
      const machine = new CancelFlowMachine({
        appId: 'app_test',
        customer: { id: 'cus_123' },
        steps: [{ type: 'survey' as const, reasons: [{ id: 'a', label: 'A' }] }, { type: 'confirm' as const }],
      })
      machine.selectReason('a')
      machine.close()

      await new Promise((r) => setTimeout(r, 0))
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/api/sessions/sdk'),
        expect.objectContaining({ method: 'POST' }),
      )
      const body = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string)
      expect(body.aborted).toBe(true)
      expect(body.canceled).toBe(false)
      fetchSpy.mockRestore()
    })

    it('does not record abort after outcome is already set', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }))
      const machine = new CancelFlowMachine({
        appId: 'app_test',
        customer: { id: 'cus_123' },
        steps: [{ type: 'survey' as const, reasons: [{ id: 'a', label: 'A' }] }, { type: 'confirm' as const }],
      })
      machine.selectReason('a')
      machine.next()
      await machine.cancel()
      expect(fetchSpy).toHaveBeenCalledTimes(1)

      machine.close()
      await new Promise((r) => setTimeout(r, 0))
      expect(fetchSpy).toHaveBeenCalledTimes(1) // no abort after cancel
      fetchSpy.mockRestore()
    })

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

    it('maps stepsViewed to API enum values (feedback→FREEFORM, custom→CUSTOM, skips success)', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }))
      const machine = new CancelFlowMachine({
        appId: 'app_test',
        customer: { id: 'cus_123' },
        steps: [
          { type: 'survey' as const, reasons: [{ id: 'a', label: 'A' }] },
          { type: 'feedback' as const },
          { type: 'nps' as any },
          { type: 'confirm' as const },
        ],
      })
      machine.selectReason('a')
      machine.next() // → feedback
      machine.next() // → nps (custom)
      machine.next() // → confirm
      await machine.cancel() // → success

      const body = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string)
      expect(body.stepsViewed.map((s: { stepType: string }) => s.stepType)).toEqual([
        'SURVEY',
        'FREEFORM',
        'CUSTOM',
        'CONFIRM',
      ])
      const custom = body.stepsViewed.find((s: { stepType: string }) => s.stepType === 'CUSTOM')
      expect(custom.customStepType).toBe('nps')
      fetchSpy.mockRestore()
    })

    it('populates numChoices on SURVEY stepsViewed entries', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }))
      const machine = new CancelFlowMachine({
        appId: 'app_test',
        customer: { id: 'cus_123' },
        steps: [
          {
            type: 'survey' as const,
            reasons: [
              { id: 'a', label: 'A' },
              { id: 'b', label: 'B' },
              { id: 'c', label: 'C' },
            ],
          },
          { type: 'confirm' as const },
        ],
      })
      machine.selectReason('a')
      machine.next()
      await machine.cancel()

      const body = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string)
      const survey = body.stepsViewed.find((s: { stepType: string }) => s.stepType === 'SURVEY')
      expect(survey.numChoices).toBe(3)
      // guid is always populated — the step graph generates a stable id even
      // when there's no server blueprint to inherit one from.
      expect(survey.guid).toEqual(expect.any(String))
      fetchSpy.mockRestore()
    })

    it('records presented offers with full shape and accepted flag', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }))
      const machine = new CancelFlowMachine({
        appId: 'app_test',
        customer: { id: 'cus_123' },
        steps: [
          {
            type: 'survey' as const,
            reasons: [{ id: 'a', label: 'A', offer: { type: 'discount' as const, percent: 20, months: 3 } }],
          },
          { type: 'confirm' as const },
        ],
        onAccept: vi.fn(),
      })
      machine.selectReason('a')
      machine.next() // → offer
      await machine.accept()

      const body = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string)
      expect(body.presentedOffers).toHaveLength(1)
      expect(body.presentedOffers[0]).toMatchObject({
        offerType: 'DISCOUNT',
        discountConfig: { customAmount: 20 },
        accepted: true,
        presentedAt: expect.any(String),
        acceptedAt: expect.any(String),
      })
      expect(body.presentedOffers[0].declinedAt).toBeUndefined()
      fetchSpy.mockRestore()
    })

    it('nests offer config under per-type keys (pause → pauseConfig)', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }))
      const machine = new CancelFlowMachine({
        appId: 'app_test',
        customer: { id: 'cus_123' },
        steps: [
          {
            type: 'survey' as const,
            reasons: [{ id: 'a', label: 'A', offer: { type: 'pause' as const, months: 2, interval: 'month' } }],
          },
          { type: 'confirm' as const },
        ],
      })
      machine.selectReason('a')
      machine.next()
      machine.decline()
      await machine.cancel()

      const body = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string)
      expect(body.presentedOffers[0]).toMatchObject({
        offerType: 'PAUSE',
        pauseConfig: { maxPauseLength: 2, pauseInterval: 'MONTH' },
      })
      fetchSpy.mockRestore()
    })

    it('marks presented offer declined when user declines', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }))
      const machine = new CancelFlowMachine({
        appId: 'app_test',
        customer: { id: 'cus_123' },
        steps: [
          {
            type: 'survey' as const,
            reasons: [{ id: 'a', label: 'A', offer: { type: 'discount' as const, percent: 20, months: 3 } }],
          },
          { type: 'confirm' as const },
        ],
      })
      machine.selectReason('a')
      machine.next() // → offer
      machine.decline() // → confirm
      await machine.cancel()

      const body = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string)
      expect(body.presentedOffers).toHaveLength(1)
      expect(body.presentedOffers[0].accepted).toBe(false)
      expect(body.presentedOffers[0].declinedAt).toEqual(expect.any(String))
      fetchSpy.mockRestore()
    })

    it('routes custom offers through CUSTOM sentinel with customOfferType', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }))
      const machine = new CancelFlowMachine({
        appId: 'app_test',
        customer: { id: 'cus_123' },
        steps: [
          {
            type: 'survey' as const,
            reasons: [
              {
                id: 'seats',
                label: 'Too many seats',
                offer: { type: 'change-seats', data: { minSeats: 1 } } as any,
              },
            ],
          },
          { type: 'confirm' as const },
        ],
        onAccept: vi.fn(),
      })
      machine.selectReason('seats')
      machine.next() // → offer
      await machine.accept({ seats: 3, previousSeats: 10 })

      const body = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string)
      expect(body.acceptedOffer.offerType).toBe('CUSTOM')
      expect(body.acceptedOffer.customOfferType).toBe('change-seats')
      expect(body.acceptedOffer.customOfferResult).toEqual({ seats: 3, previousSeats: 10 })
      expect(body.acceptedOffer.couponId).toBeUndefined()
      expect(body.presentedOffers[0].offerType).toBe('CUSTOM')
      expect(body.presentedOffers[0].customOfferType).toBe('change-seats')
      fetchSpy.mockRestore()
    })

    it('uppercases pauseInterval on accepted pause offer', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }))
      const machine = new CancelFlowMachine({
        appId: 'app_test',
        customer: { id: 'cus_123' },
        steps: [
          {
            type: 'survey' as const,
            reasons: [{ id: 'a', label: 'A', offer: { type: 'pause' as const, months: 2, interval: 'month' } }],
          },
          { type: 'confirm' as const },
        ],
        onAccept: vi.fn(),
      })
      machine.selectReason('a')
      machine.next()
      await machine.accept()

      const body = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string)
      expect(body.acceptedOffer.offerType).toBe('PAUSE')
      expect(body.acceptedOffer.pauseInterval).toBe('MONTH')
      expect(body.acceptedOffer.pauseDuration).toBe(2)
      fetchSpy.mockRestore()
    })

    it('populates couponDuration on accepted discount offer from offer.months', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }))
      const machine = new CancelFlowMachine({
        appId: 'app_test',
        customer: { id: 'cus_123' },
        steps: [
          {
            type: 'survey' as const,
            reasons: [{ id: 'a', label: 'A', offer: { type: 'discount' as const, percent: 25, months: 6 } }],
          },
          { type: 'confirm' as const },
        ],
        onAccept: vi.fn(),
      })
      machine.selectReason('a')
      machine.next()
      await machine.accept()

      const body = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string)
      expect(body.acceptedOffer.couponDuration).toBe(6)
      fetchSpy.mockRestore()
    })

    it('defaults session mode to LIVE in analytics mode', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }))
      const machine = new CancelFlowMachine({
        appId: 'app_test',
        customer: { id: 'cus_123' },
        steps: [{ type: 'survey' as const, reasons: [{ id: 'a', label: 'A' }] }, { type: 'confirm' as const }],
      })
      machine.selectReason('a')
      machine.next()
      await machine.cancel()

      const body = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string)
      expect(body.mode).toBe('LIVE')
      fetchSpy.mockRestore()
    })

    it('honors mode="test" on analytics-mode sessions', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }))
      const machine = new CancelFlowMachine({
        appId: 'app_test',
        customer: { id: 'cus_123' },
        mode: 'test',
        steps: [{ type: 'survey' as const, reasons: [{ id: 'a', label: 'A' }] }, { type: 'confirm' as const }],
      })
      machine.selectReason('a')
      machine.next()
      await machine.cancel()

      const body = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string)
      expect(body.mode).toBe('TEST')
      fetchSpy.mockRestore()
    })

    it('token mode overrides FlowConfig.mode (signed token is authoritative)', async () => {
      const sessions: any[] = []
      const mockApi = {
        createSession: vi.fn(async (payload: any) => {
          sessions.push(payload)
        }),
        cancelSubscription: vi.fn(async () => {}),
      }
      // Config says 'test' but token says 'live' — token should win.
      const machine = new CancelFlowMachine({ session: 'ck_placeholder', mode: 'test' })
      machine.initializeFromEmbed(
        {
          blueprint: { _id: 'bp_1', steps: [{ stepType: 'CONFIRM' as const, enabled: true }] },
          coupons: [],
          offerPlans: [],
          customer: null,
          sessions: [],
        } as any,
        mockApi as any,
        { appId: 'a', customerId: 'c', authHash: 'h', mode: 'live' as const, issuedAt: 0 },
      )
      await machine.cancel()

      expect(sessions[0].mode).toBe('LIVE')
    })

    it('includes token-mode passthrough fields and blueprint guids in token mode', async () => {
      const sessions: any[] = []
      const mockApi = {
        createSession: vi.fn(async (payload: any) => {
          sessions.push(payload)
        }),
        cancelSubscription: vi.fn(async () => {}),
      }
      const machine = new CancelFlowMachine({ session: 'ck_placeholder' })
      machine.initializeFromEmbed(
        {
          blueprint: {
            _id: 'bp_1',
            discountCooldown: 30,
            pauseCooldown: 60,
            steps: [
              {
                stepType: 'SURVEY' as const,
                enabled: true,
                guid: 'step_survey_1',
                survey: { choices: [{ guid: 'r1', value: 'Too expensive' }] },
              },
              { stepType: 'CONFIRM' as const, enabled: true, guid: 'step_confirm_1' },
            ],
          },
          coupons: [],
          offerPlans: [],
          customer: null,
          sessions: [],
          clickToCancelEnabled: true,
          strictFTCComplianceEnabled: true,
          autoOptimizationUsed: true,
          autoOptimizationKey: 'variant-b',
        } as any,
        mockApi as any,
        { appId: 'app_1', customerId: 'cus_1', authHash: 'h', mode: 'live' as const, issuedAt: 0 },
      )
      machine.selectReason('r1')
      machine.next() // → confirm
      await machine.cancel()

      expect(sessions).toHaveLength(1)
      const payload = sessions[0]
      expect(payload.surveyId).toBe('step_survey_1')
      expect(payload.clickToCancelEnabled).toBe(true)
      expect(payload.strictFTCComplianceEnabled).toBe(true)
      expect(payload.usedClickToCancel).toBe(false)
      expect(payload.autoOptimizationUsed).toBe(true)
      expect(payload.autoOptimizationKey).toBe('variant-b')
      expect(payload.discountCooldown).toBe(30)
      expect(payload.pauseCooldown).toBe(60)
      expect(payload.discountCooldownApplied).toBe(false)
      expect(payload.pauseCooldownApplied).toBe(false)
      const survey = payload.stepsViewed.find((s: any) => s.stepType === 'SURVEY')
      const confirm = payload.stepsViewed.find((s: any) => s.stepType === 'CONFIRM')
      expect(survey.guid).toBe('step_survey_1')
      expect(confirm.guid).toBe('step_confirm_1')
    })

    it('does not include token-mode passthrough fields in analytics mode', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }))
      const machine = new CancelFlowMachine({
        appId: 'app_test',
        customer: { id: 'cus_123' },
        steps: [{ type: 'survey' as const, reasons: [{ id: 'a', label: 'A' }] }, { type: 'confirm' as const }],
      })
      machine.selectReason('a')
      machine.next()
      await machine.cancel()

      const body = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string)
      expect(body.surveyId).toBeUndefined()
      expect(body.clickToCancelEnabled).toBeUndefined()
      expect(body.strictFTCComplianceEnabled).toBeUndefined()
      expect(body.autoOptimizationUsed).toBeUndefined()
      expect(body.discountCooldown).toBeUndefined()
      fetchSpy.mockRestore()
    })

    // Pins the token + direct-customer enrichment path. The token's signed
    // customerId / subscriptionId are authoritative; consumer-supplied direct
    // data fills in extras (email, plan, currency, custom metadata) on the
    // recorded session. Regressing this would silently drop client-side
    // context from session records.
    it('merges direct customer data over token-derived ids in token mode', async () => {
      const sessions: any[] = []
      const mockApi = {
        createSession: vi.fn(async (payload: any) => {
          sessions.push(payload)
        }),
        cancelSubscription: vi.fn(async () => {}),
      }
      const machine = new CancelFlowMachine({
        session: 'ck_placeholder',
        appId: 'app_test',
        customer: { id: 'will-be-overridden', email: 'jane@acme.com' },
        subscriptions: [
          {
            id: 'will-be-overridden-too',
            start: '2024-06-01',
            status: { name: 'active' as const, currentPeriod: { start: '2025-04-01', end: '2025-05-01' } },
            items: [{ price: { id: 'price_pro', amount: { value: 4999, currency: 'usd' } } }],
          },
        ],
      })
      machine.initializeFromEmbed(
        {
          blueprint: { _id: 'bp_1', steps: [{ stepType: 'CONFIRM' as const, enabled: true }] },
          coupons: [],
          offerPlans: [],
          customer: null,
          sessions: [],
        } as any,
        mockApi as any,
        {
          appId: 'app_test',
          customerId: 'token_cus',
          subscriptionId: 'token_sub',
          authHash: 'h',
          mode: 'live' as const,
          issuedAt: 0,
        },
      )
      await machine.cancel()

      expect(sessions).toHaveLength(1)
      const customer = sessions[0].customer
      // Token wins on identity:
      expect(customer.id).toBe('token_cus')
      expect(customer.subscriptionId).toBe('token_sub')
      // Direct data fills in client-side context the server didn't have:
      expect(customer.email).toBe('jane@acme.com')
      expect(customer.planId).toBe('price_pro')
      expect(customer.planPrice).toBe(4999)
      expect(customer.currency).toBe('usd')
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
      )

      expect(machine.getSnapshot().customer).toEqual(mockCustomer)
    })
  })
})
