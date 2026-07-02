import { describe, expect, it } from 'vitest'
import { buildQuery } from '../../src/tools/filters'

describe('buildQuery', () => {
  it('flattens exclusion filters and joins breakdown dimensions', () => {
    expect(
      buildQuery({
        startDate: '2026-01-01',
        customerEmail: null,
        limit: 50,
        skip: 0,
        not: {
          saveType: 'ABANDON',
          canceled: true,
          response: undefined,
        },
        breakdownBy: ['month', 'saveType'],
      }),
    ).toEqual({
      startDate: '2026-01-01',
      limit: 50,
      skip: 0,
      '-saveType': 'ABANDON',
      '-canceled': true,
      breakdown: 'month-saveType',
    })
  })

  it('omits empty breakdowns', () => {
    expect(buildQuery({ breakdownBy: [] })).toEqual({})
  })
})
