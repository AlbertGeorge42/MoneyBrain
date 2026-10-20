import { describe, it, expect } from 'vitest'
import { formatCurrency, formatPercent, currencyAxisFormatter } from '../../src/utils/format'
import { formatAmount, getAmountColor } from '../../src/utils/formatAmount'
import { getFlatFinancialTokens } from '../../src/styles/theme/financial-tokens'

describe('format utils', () => {
  describe('formatCurrency', () => {
    it('应该格式化数字为货币字符串（含千分位）', () => {
      expect(formatCurrency(1234.5)).toBe('¥1,234.50')
    })

    it('应该支持自定义小数位', () => {
      expect(formatCurrency(1234.5, { decimals: 0 })).toBe('¥1,235')
    })

    it('应该支持显示正号', () => {
      expect(formatCurrency(1234.5, { showSign: true })).toBe('+¥1,234.50')
    })

    it('应该正确格式化负数', () => {
      expect(formatCurrency(-1234.5)).toBe('-¥1,234.50')
    })

    it('应该支持隐藏货币符号', () => {
      expect(formatCurrency(1234.5, { showSymbol: false })).toBe('1,234.50')
    })

    it('应该处理零值', () => {
      expect(formatCurrency(0)).toBe('¥0.00')
    })

    it('应该处理大额数字', () => {
      expect(formatCurrency(1234567.89)).toBe('¥1,234,567.89')
    })
  })

  describe('formatPercent', () => {
    it('应该格式化正百分比（带正号）', () => {
      expect(formatPercent(5.2)).toBe('+5.2%')
    })

    it('应该格式化负百分比', () => {
      expect(formatPercent(-3.1)).toBe('-3.1%')
    })

    it('应该支持不显示正号', () => {
      expect(formatPercent(35.5, 1, false)).toBe('35.5%')
    })

    it('应该支持自定义小数位', () => {
      expect(formatPercent(5.234, 2)).toBe('+5.23%')
    })

    it('应该处理零值', () => {
      expect(formatPercent(0)).toBe('+0.0%')
    })
  })

  describe('currencyAxisFormatter', () => {
    it('应该格式化坐标轴数值（含千分位）', () => {
      expect(currencyAxisFormatter(1000)).toBe('¥1,000')
    })
  })
})

const lightTokens = getFlatFinancialTokens(false)
const darkTokens = getFlatFinancialTokens(true)

describe('formatAmount', () => {
  describe('资产 asset', () => {
    it('正数: 绿色 +¥1,000.00', () => {
      const r = formatAmount(1000, 'asset')
      expect(r.text).toBe('¥1,000.00')
      expect(r.color).toBe(lightTokens.positive)
    })

    it('负数: 红色 -¥500.00', () => {
      const r = formatAmount(-500, 'asset')
      expect(r.text).toBe('-¥500.00')
      expect(r.color).toBe(lightTokens.negative)
    })

    it('零: 绿色（正向）', () => {
      const r = formatAmount(0, 'asset')
      expect(r.color).toBe(lightTokens.positive)
    })
  })

  describe('负债 liability', () => {
    it('正数（欠款）: 红色', () => {
      const r = formatAmount(2000, 'liability')
      expect(r.text).toBe('¥2,000.00')
      expect(r.color).toBe(lightTokens.negative)
    })

    it('负数（多还款）: 绿色', () => {
      const r = formatAmount(-500, 'liability')
      expect(r.text).toBe('-¥500.00')
      expect(r.color).toBe(lightTokens.positive)
    })
  })

  describe('现金流 flow', () => {
    it('正数: 绿色', () => {
      expect(formatAmount(1000, 'flow').color).toBe(lightTokens.positive)
    })

    it('负数: 红色', () => {
      expect(formatAmount(-1000, 'flow').color).toBe(lightTokens.negative)
    })
  })

  describe('displayAbs 选项', () => {
    it('正值 displayAbs: 文本不变', () => {
      const r = formatAmount(1000, 'flow', { displayAbs: true })
      expect(r.text).toBe('¥1,000.00')
      expect(r.color).toBe(lightTokens.positive)
    })

    it('负值 displayAbs: 文本取绝对值（红色正数），颜色仍按原值', () => {
      const r = formatAmount(-1500, 'flow', { displayAbs: true })
      expect(r.text).toBe('¥1,500.00')
      expect(r.color).toBe(lightTokens.negative)
    })

    it('零值 displayAbs: 文本零，颜色正向', () => {
      const r = formatAmount(0, 'flow', { displayAbs: true })
      expect(r.text).toBe('¥0.00')
      expect(r.color).toBe(lightTokens.positive)
    })
  })

  describe('深色模式', () => {
    it('正数使用深色主题的绿色', () => {
      const r = formatAmount(1000, 'asset', { isDark: true })
      expect(r.color).toBe(darkTokens.positive)
    })

    it('负数使用深色主题的红色', () => {
      const r = formatAmount(-500, 'asset', { isDark: true })
      expect(r.color).toBe(darkTokens.negative)
    })
  })

  describe('options', () => {
    it('支持 showSymbol=false', () => {
      expect(formatAmount(1000, 'asset', { showSymbol: false }).text).toBe('1,000.00')
    })

    it('支持 showSign=true', () => {
      expect(formatAmount(1000, 'asset', { showSign: true }).text).toBe('+¥1,000.00')
    })

    it('支持自定义 decimals', () => {
      expect(formatAmount(1234.5, 'asset', { decimals: 0 }).text).toBe('¥1,235')
    })
  })

  it('默认 type 为 asset', () => {
    expect(formatAmount(100).color).toBe(formatAmount(100, 'asset').color)
  })
})

describe('getAmountColor', () => {
  it('资产 0 → 绿色', () => {
    expect(getAmountColor(0, 'asset')).toBe(lightTokens.positive)
  })

  it('负债 0 → 红色', () => {
    expect(getAmountColor(0, 'liability')).toBe(lightTokens.negative)
  })

  it('flow 0 → 绿色', () => {
    expect(getAmountColor(0, 'flow')).toBe(lightTokens.positive)
  })

  it('深色模式资产 0 → 深绿色', () => {
    expect(getAmountColor(0, 'asset', true)).toBe(darkTokens.positive)
  })
})
