import { describe, expect, it } from 'vitest'
import { applyMergeFields, applyMergeFieldsToSteps, buildMergeAttrs } from '../../src/core/merge-fields'
import type { Step } from '../../src/core/types'

describe('applyMergeFields', () => {
  it('substitutes fields with values from attrs', () => {
    const result = applyMergeFields('Hi {{CUSTOMER_NAME.FIRST|there}}, welcome back!', {
      'CUSTOMER_NAME.FIRST': 'Jane',
    })
    expect(result).toBe('Hi Jane, welcome back!')
  })

  it('falls back to the pipe segment when the field is missing', () => {
    const result = applyMergeFields('Hi {{CUSTOMER_NAME.FIRST|there}}', {})
    expect(result).toBe('Hi there')
  })

  it('falls back to empty string when no fallback is provided', () => {
    const result = applyMergeFields('Hi {{CUSTOMER_NAME.FIRST|}}', {})
    expect(result).toBe('Hi ')
  })

  it('substitutes the {{…}} template inside a <merge-field> wrapper', () => {
    // The wrapper tag stays — browsers render unknown tags as their children,
    // so the visible output is just the substituted name.
    const input = `<p><merge-field id="CUSTOMER_NAME.FIRST" fallback="">{{CUSTOMER_NAME.FIRST|}}</merge-field>, welcome!</p>`
    const result = applyMergeFields(input, { 'CUSTOMER_NAME.FIRST': 'Jane' })
    expect(result).toContain('>Jane</merge-field>')
    expect(result).not.toContain('{{CUSTOMER_NAME.FIRST')
  })

  it('is a no-op when the string has no merge fields', () => {
    const input = 'Just some text'
    expect(applyMergeFields(input, { FOO: 'bar' })).toBe(input)
  })

  it('handles multiple merge fields in one string', () => {
    const result = applyMergeFields('{{A|-}} and {{B|-}}', { A: 'one', B: 'two' })
    expect(result).toBe('one and two')
  })
})

describe('buildMergeAttrs', () => {
  it('returns an empty map when customer is null', () => {
    expect(buildMergeAttrs(null)).toEqual({})
  })

  it('derives name variants from first + last name', () => {
    const attrs = buildMergeAttrs({
      id: 'cus_1',
      name: 'Jane',
      lastName: 'Smith',
    })
    expect(attrs.CUSTOMER_NAME).toBe('Jane Smith')
    expect(attrs['CUSTOMER_NAME.FIRST']).toBe('Jane')
    expect(attrs['CUSTOMER_NAME.LAST']).toBe('Smith')
  })

  it('omits LAST when only first name is provided', () => {
    const attrs = buildMergeAttrs({ id: 'cus_1', name: 'Cher' })
    expect(attrs.CUSTOMER_NAME).toBe('Cher')
    expect(attrs['CUSTOMER_NAME.FIRST']).toBe('Cher')
    expect(attrs['CUSTOMER_NAME.LAST']).toBeUndefined()
  })

  it('includes email and metadata', () => {
    const attrs = buildMergeAttrs({
      id: 'cus_1',
      email: 'jane@acme.com',
      metadata: { PLAN: 'pro', TEAM_SIZE: 12 },
    })
    expect(attrs.CUSTOMER_EMAIL).toBe('jane@acme.com')
    expect(attrs.PLAN).toBe('pro')
    expect(attrs.TEAM_SIZE).toBe('12')
  })
})

describe('applyMergeFieldsToSteps', () => {
  const customer = { id: 'cus_1', name: 'Jane', lastName: 'Smith', email: 'jane@acme.com' }

  it('substitutes placeholders in step title and description', () => {
    const steps: Step[] = [
      { type: 'feedback', title: 'Hi {{CUSTOMER_NAME.FIRST|there}}', description: '<p>Email: {{CUSTOMER_EMAIL|}}</p>' },
    ]
    const [out] = applyMergeFieldsToSteps(steps, customer)
    const feedback = out as Extract<Step, { type: 'feedback' }>
    expect(feedback.title).toBe('Hi Jane')
    expect(feedback.description).toBe('<p>Email: jane@acme.com</p>')
  })

  it('substitutes placeholders in offer copy', () => {
    const steps: Step[] = [
      {
        type: 'offer',
        offer: {
          type: 'contact',
          copy: {
            headline: 'Get in touch!',
            body: '{{CUSTOMER_NAME.FIRST|}}, our support channel is ready',
            cta: 'Contact',
            declineCta: 'No thanks',
          },
        },
      },
    ]
    const [out] = applyMergeFieldsToSteps(steps, customer)
    const offerStep = out as Extract<Step, { type: 'offer' }>
    expect(offerStep.offer?.copy.body).toBe('Jane, our support channel is ready')
    expect(offerStep.offer?.copy.headline).toBe('Get in touch!')
  })

  it('substitutes placeholders in survey reason labels', () => {
    const steps: Step[] = [
      { type: 'survey', reasons: [{ id: 'r1', label: 'Hi {{CUSTOMER_NAME.FIRST|}}, why leave?' }] },
    ]
    const [out] = applyMergeFieldsToSteps(steps, customer)
    const survey = out as Extract<Step, { type: 'survey' }>
    expect(survey.reasons[0].label).toBe('Hi Jane, why leave?')
  })

  it('falls back to placeholder fallback when customer is null', () => {
    const steps: Step[] = [{ type: 'feedback', title: 'Hi {{CUSTOMER_NAME.FIRST|there}}' }]
    const [out] = applyMergeFieldsToSteps(steps, null)
    expect((out as Extract<Step, { type: 'feedback' }>).title).toBe('Hi there')
  })

  it('leaves strings without placeholders untouched', () => {
    const steps: Step[] = [{ type: 'confirm', title: 'Confirm cancellation' }]
    const [out] = applyMergeFieldsToSteps(steps, customer)
    const confirm = out as Extract<Step, { type: 'confirm' }>
    expect(confirm.title).toBe('Confirm cancellation')
  })

  it('passes SuccessStep through unchanged', () => {
    const steps: Step[] = [{ type: 'success', savedTitle: 'Welcome {{CUSTOMER_NAME.FIRST|}}!' }]
    const [out] = applyMergeFieldsToSteps(steps, customer)
    // SuccessStep titles aren't merge-substituted today (rendered via outcome
    // branching at render time). Verify the helper is a no-op for this type.
    expect((out as { savedTitle: string }).savedTitle).toBe('Welcome {{CUSTOMER_NAME.FIRST|}}!')
  })
})
