import { describe, it, expect } from 'vitest'
import { formatCurrency, currencyAxisFormatter } from '../../src/utils/format'
import { formatBalance, formatNetWorth } from '../../src/utils/formatBalance'

describe('format utils', () => {
  describe('formatCurrency', () => {
    it('应该格式化数字为货币字符串', () => {
      expect(formatCurrency(100)).toBe('¥100.00')
    })

    it('应该支持自定义小数位', () => {
      expect(formatCurrency(100, 0)).toBe('¥100')
    })

    it('应该处理字符串数字', () => {
      expect(formatCurrency('50.5' as any)).toBe('¥50.50')
    })

    it('应该处理无效值', () => {
      expect(formatCurrency(NaN)).toBe('¥NaN')
    })
  })

  describe('currencyAxisFormatter', () => {
    it('应该格式化坐标轴数值', () => {
      expect(currencyAxisFormatter(1000)).toBe('¥1000')
    })
  })

  describe('formatBalance', () => {
    it('资产账户正余额应该显示绿色', () => {
      const result = formatBalance(1000, 'asset')
      expect(result.text).toBe('¥1000.00')
      expect(result.displayValue).toBe(1000)
    })

    it('资产账户负余额应该显示红色', () => {
      const result = formatBalance(-500, 'asset')
      expect(result.text).toBe('¥-500.00')
      expect(result.displayValue).toBe(-500)
    })

    it('负债账户负余额应该显示绝对值', () => {
      const result = formatBalance(-2000, 'liability')
      expect(result.text).toBe('¥2000.00')
      expect(result.displayValue).toBe(2000)
    })

    it('负债账户正余额应该显示负数', () => {
      const result = formatBalance(500, 'liability')
      expect(result.text).toBe('¥-500.00')
      expect(result.displayValue).toBe(-500)
    })

    it('应该支持隐藏货币符号', () => {
      const result = formatBalance(100, 'asset', false)
      expect(result.text).toBe('100.00')
    })
  })

  describe('formatNetWorth', () => {
    it('正净资产应该显示绿色', () => {
      const result = formatNetWorth(10000)
      expect(result.text).toBe('¥10000.00')
      expect(result.displayValue).toBe(10000)
    })

    it('负净资产应该显示红色', () => {
      const result = formatNetWorth(-5000)
      expect(result.text).toBe('¥-5000.00')
      expect(result.displayValue).toBe(-5000)
    })
  })
})
