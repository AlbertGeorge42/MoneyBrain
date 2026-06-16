import { describe, it, expect } from 'vitest'
import { formatCurrency, formatPercent, currencyAxisFormatter } from '../../src/utils/format'
import { formatBalance } from '../../src/utils/formatBalance'

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

  describe('formatBalance', () => {
    it('资产账户正余额应该显示绿色', () => {
      const result = formatBalance(1000, 'asset')
      expect(result.text).toBe('¥1,000.00')
      expect(result.displayValue).toBe(1000)
      expect(result.sign).toBe('positive')
    })

    it('资产账户负余额应该显示红色', () => {
      const result = formatBalance(-500, 'asset')
      expect(result.text).toBe('-¥500.00')
      expect(result.displayValue).toBe(-500)
      expect(result.sign).toBe('negative')
    })

    it('负债账户负余额应该显示绝对值', () => {
      const result = formatBalance(-2000, 'liability')
      expect(result.text).toBe('¥2,000.00')
      expect(result.displayValue).toBe(2000)
      expect(result.sign).toBe('negative')
    })

    it('负债账户正余额应该显示负数', () => {
      const result = formatBalance(500, 'liability')
      expect(result.text).toBe('-¥500.00')
      expect(result.displayValue).toBe(-500)
      expect(result.sign).toBe('positive')
    })

    it('应该支持隐藏货币符号', () => {
      const result = formatBalance(100, 'asset', false)
      expect(result.text).toBe('100.00')
    })
  })
})
