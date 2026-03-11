import { describe, it, expect, vi } from 'vitest'
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
      expect(machine.snapshot.step).toBe('survey')
    })

    it('exposes reasons from config', () => {
      const machine = new CancelFlowMachine(baseConfig)
      expect(machine.reasons).toHaveLength(3)
      expect(machine.reasons[0].id).toBe('expensive')
    })

    it('has null selected reason initially', () => {
      const machine = new CancelFlowMachine(baseConfig)
      expect(machine.snapshot.selectedReason).toBeNull()
    })

    it('has null recommendation initially', () => {
      const machine = new CancelFlowMachine(baseConfig)
      expect(machine.snapshot.recommendation).toBeNull()
    })
  })

  describe('selectReason', () => {
    it('selects a reason and populates recommendation when offer exists', () => {
      const machine = new CancelFlowMachine(baseConfig)
      machine.selectReason('expensive')
      expect(machine.snapshot.selectedReason).toBe('expensive')
      expect(machine.snapshot.recommendation).not.toBeNull()
      expect(machine.snapshot.recommendation!.type).toBe('discount')
    })

    it('selects a reason with null recommendation when no offer', () => {
      const machine = new CancelFlowMachine(baseConfig)
      machine.selectReason('missing')
      expect(machine.snapshot.selectedReason).toBe('missing')
      expect(machine.snapshot.recommendation).toBeNull()
    })

    it('ignores unknown reason ids', () => {
      const machine = new CancelFlowMachine(baseConfig)
      machine.selectReason('nonexistent')
      expect(machine.snapshot.selectedReason).toBeNull()
    })

    it('generates default copy for discount offer', () => {
      const machine = new CancelFlowMachine(baseConfig)
      machine.selectReason('expensive')
      const copy = machine.snapshot.recommendation!.copy
      expect(copy.headline).toContain('20%')
      expect(copy.cta).toBeTruthy()
      expect(copy.declineCta).toBeTruthy()
    })

    it('generates default copy for pause offer', () => {
      const machine = new CancelFlowMachine(baseConfig)
      machine.selectReason('not-using')
      const copy = machine.snapshot.recommendation!.copy
      expect(copy.headline).toContain('break')
      expect(copy.body).toContain('2 months')
    })
  })

  describe('navigation - next', () => {
    it('navigates to offer step when reason has offer', () => {
      const machine = new CancelFlowMachine(baseConfig)
      machine.selectReason('expensive')
      machine.next()
      expect(machine.snapshot.step).toBe('offer')
    })

    it('skips offer step when reason has no offer', () => {
      const machine = new CancelFlowMachine(baseConfig)
      machine.selectReason('missing')
      machine.next()
      expect(machine.snapshot.step).toBe('feedback')
    })

    it('navigates from offer to feedback', () => {
      const machine = new CancelFlowMachine(baseConfig)
      machine.selectReason('expensive')
      machine.next() // -> offer
      machine.next() // -> feedback
      expect(machine.snapshot.step).toBe('feedback')
    })

    it('navigates from feedback to confirm', () => {
      const machine = new CancelFlowMachine(baseConfig)
      machine.selectReason('missing')
      machine.next() // -> feedback
      machine.next() // -> confirm
      expect(machine.snapshot.step).toBe('confirm')
    })
  })

  describe('navigation - back', () => {
    it('goes back from offer to survey', () => {
      const machine = new CancelFlowMachine(baseConfig)
      machine.selectReason('expensive')
      machine.next() // -> offer
      machine.back()
      expect(machine.snapshot.step).toBe('survey')
    })

    it('goes back from feedback to offer when offer exists', () => {
      const machine = new CancelFlowMachine(baseConfig)
      machine.selectReason('expensive')
      machine.next() // -> offer
      machine.next() // -> feedback
      machine.back()
      expect(machine.snapshot.step).toBe('offer')
    })

    it('goes back from feedback to survey when no offer', () => {
      const machine = new CancelFlowMachine(baseConfig)
      machine.selectReason('missing')
      machine.next() // -> feedback
      machine.back()
      expect(machine.snapshot.step).toBe('survey')
    })

    it('goes back from confirm to feedback', () => {
      const machine = new CancelFlowMachine(baseConfig)
      machine.selectReason('missing')
      machine.next() // -> feedback
      machine.next() // -> confirm
      machine.back()
      expect(machine.snapshot.step).toBe('feedback')
    })

    it('does nothing when on survey', () => {
      const machine = new CancelFlowMachine(baseConfig)
      machine.back()
      expect(machine.snapshot.step).toBe('survey')
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
      expect(machine.snapshot.step).toBe('confirm')
    })

    it('goes back from confirm to survey when no feedback and no offer', () => {
      const machine = new CancelFlowMachine(noFeedbackConfig)
      machine.selectReason('missing')
      machine.next() // -> confirm
      machine.back()
      expect(machine.snapshot.step).toBe('survey')
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
      expect(machine.snapshot.step).toBe('success')
      expect(machine.snapshot.outcome).toBe('saved')
    })

    it('sets isProcessing during accept', async () => {
      let resolveAccept: () => void
      const onAccept = vi.fn(
        () => new Promise<void>((resolve) => { resolveAccept = resolve }),
      )
      const machine = new CancelFlowMachine({ ...baseConfig, onAccept })
      machine.selectReason('expensive')
      machine.next()

      const acceptPromise = machine.accept()
      expect(machine.snapshot.isProcessing).toBe(true)

      resolveAccept!()
      await acceptPromise
      expect(machine.snapshot.isProcessing).toBe(false)
    })

    it('handles accept errors', async () => {
      const error = new Error('Payment failed')
      const onAccept = vi.fn(() => Promise.reject(error))
      const machine = new CancelFlowMachine({ ...baseConfig, onAccept })
      machine.selectReason('expensive')
      machine.next()
      await machine.accept()

      expect(machine.snapshot.isProcessing).toBe(false)
      expect(machine.snapshot.error).toBe(error)
      expect(machine.snapshot.step).toBe('offer') // stays on offer
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
      expect(machine.snapshot.step).toBe('feedback')
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
      expect(machine.snapshot.step).toBe('success')
      expect(machine.snapshot.outcome).toBe('cancelled')
    })

    it('handles cancel errors', async () => {
      const error = new Error('Cancel failed')
      const onCancel = vi.fn(() => Promise.reject(error))
      const machine = new CancelFlowMachine({ ...baseConfig, onCancel })
      machine.selectReason('missing')
      machine.next()
      machine.next()
      await machine.cancel()

      expect(machine.snapshot.error).toBe(error)
      expect(machine.snapshot.step).toBe('confirm') // stays on confirm
    })
  })

  describe('feedback', () => {
    it('updates feedback text', () => {
      const machine = new CancelFlowMachine(baseConfig)
      machine.setFeedback('Great product but too expensive')
      expect(machine.snapshot.feedback).toBe('Great product but too expensive')
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
})
