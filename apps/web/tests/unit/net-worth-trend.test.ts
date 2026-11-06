import { describe, expect, it } from 'vitest'
import { trendChangePct } from '@/features/overview/format'
import type { TrendPoint } from '@/features/overview/model'

function point(month: string, value: number): TrendPoint {
  return { month, value }
}

describe('trendChangePct', () => {
  it('基期为 0 时返回 null，输出既不是 Infinity 也不是 NaN', () => {
    const result = trendChangePct([point('2026-10', 0), point('2026-11', 2_800)])
    expect(result).toBeNull()
    const text = result === null ? '基期无数据，无法计算涨幅' : String(result)
    expect(text).not.toContain('Infinity')
    expect(text).not.toContain('NaN')
    expect(Number.isFinite(result as number)).toBe(false)
  })

  it('基期缺失（不足两个点）时同样返回 null', () => {
    expect(trendChangePct([point('2026-11', 2_800)])).toBeNull()
    expect(trendChangePct([])).toBeNull()
  })

  it('基期正常时仍返回百分比，绝对值曲线不受影响', () => {
    expect(trendChangePct([point('2026-10', 1_000), point('2026-11', 2_000)])).toBe(100)
    expect(trendChangePct([point('2026-10', 2_000), point('2026-11', 1_000)])).toBe(-50)
  })

  it('基期不是有限数时返回 null', () => {
    expect(trendChangePct([point('2026-10', Number.NaN), point('2026-11', 2_800)])).toBeNull()
    expect(trendChangePct([point('2026-10', Number.POSITIVE_INFINITY), point('2026-11', 2_800)]))
      .toBeNull()
  })
})
