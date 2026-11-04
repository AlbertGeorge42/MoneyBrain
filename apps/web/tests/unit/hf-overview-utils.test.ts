/**
 * HF 总览纯函数：净资产口径、储蓄率、走势几何与轴标签。
 */
import { describe, it, expect } from 'vitest'
import { OVERVIEW_MOCK, RECENT_LIMIT } from '../../src/features/overview/overview-mock'
import {
  buildTrendGeometry,
  deriveNetWorth,
  formatCompactMoney,
  savingsRate,
} from '../../src/features/overview/overview-utils'

describe('deriveNetWorth', () => {
  it('正常账本只在快照基础上叠加本次新增记录的净额', () => {
    const base = 1000
    const baselineNet = 100
    expect(deriveNetWorth({ freshLedger: false, base, baselineNet, currentNet: 100 })).toBe(base)
    expect(deriveNetWorth({ freshLedger: false, base, baselineNet, currentNet: 140 })).toBe(1040)
    expect(deriveNetWorth({ freshLedger: false, base, baselineNet, currentNet: -60 })).toBe(840)
  })

  it('冷启动账本没有历史快照，净资产等于已记流水净额', () => {
    expect(deriveNetWorth({ freshLedger: true, base: 1000, baselineNet: 100, currentNet: -28 })).toBe(-28)
  })
})

describe('savingsRate', () => {
  it('有收入时返回结余占比', () => {
    expect(savingsRate(1000, 300)).toBeCloseTo(0.3)
  })

  it('没有收入时返回 null，由 UI 显示占位符', () => {
    expect(savingsRate(0, -50)).toBeNull()
    expect(savingsRate(-10, 10)).toBeNull()
  })
})

describe('formatCompactMoney', () => {
  it('万元以上保留一位小数', () => {
    expect(formatCompactMoney(286345.2)).toBe('¥28.6万')
  })

  it('不足一万元取整并保留负号', () => {
    expect(formatCompactMoney(-980)).toBe('−¥980')
    expect(formatCompactMoney(0)).toBe('¥0')
  })
})

describe('buildTrendGeometry', () => {
  const points = [
    { label: '12月', value: 100 },
    { label: '1月', value: 150 },
    { label: '2月', value: 120 },
  ]

  it('按索引均匀铺满宽度，并把最小/最大值映射到上下留白内', () => {
    const geo = buildTrendGeometry(points)
    expect(geo).not.toBeNull()
    if (!geo) return
    expect(geo.points.map((point) => point.x)).toEqual([0, 50, 100])
    expect(geo.max).toBe(150)
    expect(geo.min).toBe(100)
    expect(geo.points[1].y).toBe(8)
    expect(geo.points[0].y).toBe(92)
    expect(geo.linePath.startsWith('M0 92 ')).toBe(true)
    expect(geo.areaPath.endsWith('Z')).toBe(true)
  })

  it('少于两个点返回 null，让 UI 显示刚起步占位', () => {
    expect(buildTrendGeometry([])).toBeNull()
    expect(buildTrendGeometry([{ label: '现在', value: 10 }])).toBeNull()
  })

  it('所有点相等时仍产出合法路径', () => {
    const flat = buildTrendGeometry([
      { label: 'A', value: 10 },
      { label: 'B', value: 10 },
    ])
    expect(flat).not.toBeNull()
    if (!flat) return
    expect(flat.linePath).toContain('L100 92')
  })
})

describe('overview mock', () => {
  it('走势有 12 个月，且最后一点与净资产快照一致', () => {
    expect(OVERVIEW_MOCK.trend).toHaveLength(12)
    expect(OVERVIEW_MOCK.trend[OVERVIEW_MOCK.trend.length - 1].value).toBe(OVERVIEW_MOCK.netWorth)
  })

  it('最近流水条数符合平台设计（PC 3 条 / 移动 4 条）', () => {
    expect(RECENT_LIMIT).toEqual({ pc: 3, mobile: 4 })
  })
})
