import { describe, expect, it } from 'vitest'
import { barHeight } from '@/features/reports/reportsModel'

describe('barHeight', () => {
  it('负金额不再产生负高度', () => {
    expect(barHeight(-2_800, 1, 166)).toBe(0)
  })

  it('零数据与非有限值一律给出 0', () => {
    expect(barHeight(0, 0, 166)).toBe(0)
    expect(barHeight(Number.NaN, 1, 166)).toBe(0)
    expect(barHeight(Number.POSITIVE_INFINITY, 1, 166)).toBe(0)
    expect(barHeight(1, 1, Number.NaN)).toBe(0)
  })

  it('正常金额仍按比例出柱', () => {
    expect(barHeight(2_800, 5_600, 166)).toBeCloseTo(83, 6)
    expect(barHeight(1, 1, 100)).toBe(100)
  })
})
