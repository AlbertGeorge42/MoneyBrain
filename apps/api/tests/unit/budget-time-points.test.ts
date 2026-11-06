import { describe, expect, it } from 'vitest'
import { generateBudgetTimePoints } from '../../src/services/budget.service.js'
import { formatDateLocal } from '../../src/common/date.js'

const localDate = (year: number, month: number, day: number): Date =>
  new Date(year, month - 1, day)

describe('generateBudgetTimePoints 季度/年度天偏移', () => {
  it('季度天偏移从季度起点算起，窗口起点之前的落点不进结果', () => {
    // 窗口从 Q4 中间开始：10-01 + 10 天 = 10-11 < 11-06，应被裁掉
    const start = localDate(2026, 11, 6)
    const end = localDate(2026, 12, 31)

    expect(generateBudgetTimePoints(start, end, 'quarterly', 10)).toEqual([])

    // 默认季度末：12-31 落在窗口内
    const defaults = generateBudgetTimePoints(start, end, 'quarterly', null)
    expect(defaults.map(formatDateLocal)).toEqual(['2026-12-31'])
  })

  it('年度天偏移从年度起点算起，窗口起点之前的落点不进结果', () => {
    const start = localDate(2026, 11, 6)
    const end = localDate(2026, 12, 31)

    // 0 天 = 01-01，早于窗口起点，应被裁掉
    expect(generateBudgetTimePoints(start, end, 'yearly', 0)).toEqual([])

    // 364 天 = 非闰年 12-31，落在窗口内
    const lastDay = generateBudgetTimePoints(start, end, 'yearly', 364)
    expect(lastDay.map(formatDateLocal)).toEqual(['2026-12-31'])
  })

  it('月度预算的过去日期不被当作未来点位', () => {
    const start = localDate(2026, 11, 6)
    const end = localDate(2026, 12, 31)

    // 5 号在 11-06 之前：11 月应跳过，只保留 12-05
    const points = generateBudgetTimePoints(start, end, 'monthly', 5)
    expect(points.map(formatDateLocal)).toEqual(['2026-12-05'])
  })
})
