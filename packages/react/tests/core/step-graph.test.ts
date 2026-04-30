import { describe, expect, it } from 'vitest'
import { buildStepGraph } from '../../src/core/step-graph'
import { defaultOfferCopy } from '../../src/core/transform'
import type { Step } from '../../src/core/types'

describe('buildStepGraph', () => {
  it('returns empty graph for empty steps', () => {
    const graph = buildStepGraph([], defaultOfferCopy)
    expect(graph.firstStepId).toBe('')
    expect(Object.keys(graph.stepMap)).toHaveLength(0)
  })

  it('links sequential steps via defaultNext/Previous pointers', () => {
    const steps: Step[] = [
      { type: 'survey', guid: 's', reasons: [] },
      { type: 'feedback', guid: 'f' },
      { type: 'confirm', guid: 'c' },
    ]
    const graph = buildStepGraph(steps, defaultOfferCopy)

    expect(graph.firstStepId).toBe('s')
    expect(graph.stepMap.s.defaultNextStep).toBe('f')
    expect(graph.stepMap.s.defaultPreviousStep).toBeUndefined()
    expect(graph.stepMap.f.defaultNextStep).toBe('c')
    expect(graph.stepMap.f.defaultPreviousStep).toBe('s')
    expect(graph.stepMap.c.defaultNextStep).toBeUndefined()
    expect(graph.stepMap.c.defaultPreviousStep).toBe('f')
  })

  it("generates guids for steps that don't provide them", () => {
    const steps: Step[] = [{ type: 'survey', reasons: [] }, { type: 'confirm' }]
    const graph = buildStepGraph(steps, defaultOfferCopy)
    expect(graph.firstStepId).toMatch(/step-0-survey/)
    expect(Object.keys(graph.stepMap)).toHaveLength(2)
  })

  it('creates a synthetic offer step per survey choice with an attached offer', () => {
    const steps: Step[] = [
      {
        type: 'survey',
        guid: 's',
        reasons: [
          { id: 'expensive', label: 'Too expensive', offer: { type: 'discount', percentOff: 20, durationInMonths: 3 } },
          { id: 'notusing', label: 'Not using it', offer: { type: 'pause', months: 2 } },
          { id: 'missing', label: 'Missing features' }, // no offer → no synthetic step
        ],
      },
      { type: 'confirm', guid: 'c' },
    ]
    const graph = buildStepGraph(steps, defaultOfferCopy)

    // Two synthetic offer steps, keyed deterministically by survey guid + reason id.
    const syntheticIds = Object.keys(graph.stepMap).filter((k) => k.includes(':offer:'))
    expect(syntheticIds).toHaveLength(2)

    // Survey step records the choice→offer-step mapping.
    const survey = graph.stepMap.s
    expect(survey.offersAttached).toEqual({
      expensive: 's:offer:expensive',
      notusing: 's:offer:notusing',
    })

    // Synthetic steps are offer-typed, flagged as survey-derived, and slot
    // between survey and survey's default next.
    const syntheticDiscount = graph.stepMap['s:offer:expensive']
    expect(syntheticDiscount.type).toBe('offer')
    expect(syntheticDiscount.surveyOffer).toBe(true)
    expect(syntheticDiscount.offer?.type).toBe('discount')
    expect(syntheticDiscount.defaultPreviousStep).toBe('s')
    expect(syntheticDiscount.defaultNextStep).toBe('c')
  })

  it("preserves a standalone OFFER step's attached offer", () => {
    const offerDecision = {
      type: 'pause' as const,
      months: 2,
      copy: { headline: 'H', body: 'B', cta: 'C', declineCta: 'D' },
    }
    const steps: Step[] = [
      { type: 'offer', guid: 'o', offer: offerDecision },
      { type: 'confirm', guid: 'c' },
    ]
    const graph = buildStepGraph(steps, defaultOfferCopy)

    expect(graph.stepMap.o.offer).toEqual(offerDecision)
    expect(graph.stepMap.o.surveyOffer).toBeUndefined()
  })

  it('survey-attached offers without copy get default copy', () => {
    const steps: Step[] = [
      {
        type: 'survey',
        guid: 's',
        reasons: [{ id: 'a', label: 'A', offer: { type: 'discount', percentOff: 20, durationInMonths: 3 } }],
      },
      { type: 'confirm', guid: 'c' },
    ]
    const graph = buildStepGraph(steps, defaultOfferCopy)
    const synthetic = graph.stepMap['s:offer:a']
    expect(synthetic.offer?.copy.headline).toBeTruthy()
  })

  it('orderedStepIds reflects user-declared order, excluding synthetic offers', () => {
    const steps: Step[] = [
      {
        type: 'survey',
        guid: 's',
        reasons: [{ id: 'a', label: 'A', offer: { type: 'discount', percentOff: 20, durationInMonths: 3 } }],
      },
      { type: 'feedback', guid: 'f' },
      { type: 'confirm', guid: 'c' },
    ]
    const graph = buildStepGraph(steps, defaultOfferCopy)
    expect(graph.orderedStepIds).toEqual(['s', 'f', 'c'])
  })
})
