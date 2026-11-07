import { describe, it, expect } from 'vitest'
import { formatCurrency, formatPercent, currencyAxisFormatter } from '../../src/utils/format'

describe('format utils', () => {
  describe('formatCurrency', () => {
    it('应该格式化数字为货币字符串（含千分位）', () => {
      expect(formatCurrency(123450)).toBe('¥1,234.50')
    })

    it('应该支持自定义小数位', () => {
      expect(formatCurrency(123450, { decimals: 0 })).toBe('¥1,235')
    })

    it('应该支持显示正号', () => {
      expect(formatCurrency(123450, { showSign: true })).toBe('+¥1,234.50')
    })

    it('应该正确格式化负数', () => {
      expect(formatCurrency(-123450)).toBe('-¥1,234.50')
    })

    it('应该支持隐藏货币符号', () => {
      expect(formatCurrency(123450, { showSymbol: false })).toBe('1,234.50')
    })

    it('应该处理零值', () => {
      expect(formatCurrency(0)).toBe('¥0.00')
    })

    it('应该处理大额数字', () => {
      expect(formatCurrency(123456789)).toBe('¥1,234,567.89')
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
      expect(currencyAxisFormatter(100000)).toBe('¥1,000')
    })
  })
})

