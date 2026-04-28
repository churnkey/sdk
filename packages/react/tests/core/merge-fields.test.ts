import { describe, expect, it } from 'vitest'
import { applyMergeFields, buildMergeAttrs } from '../../src/core/merge-fields'

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

  it('derives name variants from decorated.customerName', () => {
    const attrs = buildMergeAttrs({
      id: 'cus_1',
      decorated: { customerName: 'Jane Smith' },
    } as never)
    expect(attrs.CUSTOMER_NAME).toBe('Jane Smith')
    expect(attrs['CUSTOMER_NAME.FIRST']).toBe('Jane')
    expect(attrs['CUSTOMER_NAME.LAST']).toBe('Smith')
  })

  it('omits LAST when the name is a single word', () => {
    const attrs = buildMergeAttrs({ id: 'cus_1', decorated: { customerName: 'Cher' } } as never)
    expect(attrs['CUSTOMER_NAME.FIRST']).toBe('Cher')
    expect(attrs['CUSTOMER_NAME.LAST']).toBeUndefined()
  })

  it('includes email and custom attributes', () => {
    const attrs = buildMergeAttrs({
      id: 'cus_1',
      email: 'jane@acme.com',
      decorated: { customAttributes: { PLAN: 'pro', TEAM_SIZE: 12 } },
    } as never)
    expect(attrs.CUSTOMER_EMAIL).toBe('jane@acme.com')
    expect(attrs.PLAN).toBe('pro')
    expect(attrs.TEAM_SIZE).toBe('12')
  })
})
