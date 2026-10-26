import { describe, it, expect } from 'vitest'
import { toMinor, hasValue, toStringArray, parsePositiveInteger, toDate, toOptionalDate } from '../../src/common/utils.js'
import { ValidationError } from '../../src/common/error.js'

describe('utils', () => {
  describe('toMinor', () => {
    it('BigInt 分应该转成 number 分', () => {
      expect(toMinor(1234n)).toBe(1234)
    })

    it('number 原样返回', () => {
      expect(toMinor(99)).toBe(99)
    })

    it('null / undefined 应该返回 0', () => {
      expect(toMinor(null)).toBe(0)
      expect(toMinor(undefined)).toBe(0)
    })

    it('超出安全整数范围时应该直接失败', () => {
      expect(() => toMinor(2n ** 60n)).toThrow()
    })
  })

  describe('hasValue', () => {
    it('非空字符串应该返回 true', () => {
      expect(hasValue('hello')).toBe(true)
    })

    it('空字符串应该返回 false', () => {
      expect(hasValue('')).toBe(false)
    })

    it('null 应该返回 false', () => {
      expect(hasValue(null)).toBe(false)
    })

    it('undefined 应该返回 false', () => {
      expect(hasValue(undefined)).toBe(false)
    })

    it('数字 0 应该返回 true', () => {
      expect(hasValue(0)).toBe(true)
    })

    it('false 应该返回 true', () => {
      expect(hasValue(false)).toBe(true)
    })

    it('空数组应该返回 true', () => {
      expect(hasValue([])).toBe(true)
    })

    it('空对象应该返回 true', () => {
      expect(hasValue({})).toBe(true)
    })
  })

  describe('toStringArray', () => {
    it('应该将字符串转换为单元素数组', () => {
      const result = toStringArray('hello')
      expect(result).toEqual(['hello'])
    })

    it('应该将数组元素转为字符串', () => {
      const result = toStringArray([1, 2, 3])
      expect(result).toEqual(['1', '2', '3'])
    })

    it('null 应该返回 undefined', () => {
      expect(toStringArray(null)).toBeUndefined()
    })

    it('undefined 应该返回 undefined', () => {
      expect(toStringArray(undefined)).toBeUndefined()
    })

    it('空字符串应该返回 undefined', () => {
      expect(toStringArray('')).toBeUndefined()
    })
  })

  describe('parsePositiveInteger', () => {
    it('应该解析有效的正整数', () => {
      expect(parsePositiveInteger('10', '页码', 1)).toBe(10)
    })

    it('应该解析 number 类型的正整数', () => {
      expect(parsePositiveInteger(20, '数量', 1)).toBe(20)
    })

    it('空值应该返回默认值', () => {
      expect(parsePositiveInteger(null, '页码', 1)).toBe(1)
    })

    it('0 应该抛出 ValidationError', () => {
      expect(() => parsePositiveInteger(0, '页码', 1)).toThrow(ValidationError)
    })

    it('负数应该抛出 ValidationError', () => {
      expect(() => parsePositiveInteger(-5, '数量', 1)).toThrow(ValidationError)
    })

    it('小数应该抛出 ValidationError', () => {
      expect(() => parsePositiveInteger(3.14, '数量', 1)).toThrow(ValidationError)
    })

    it('非数字字符串应该抛出 ValidationError', () => {
      expect(() => parsePositiveInteger('abc', '页码', 1)).toThrow(ValidationError)
    })
  })

  describe('toDate', () => {
    it('应该解析有效的日期字符串', () => {
      const result = toDate('2024-01-15', '日期')
      expect(result).toBeInstanceOf(Date)
      expect(result.getFullYear()).toBe(2024)
      expect(result.getMonth()).toBe(0)
      expect(result.getDate()).toBe(15)
    })

    it('应该解析 ISO 日期字符串', () => {
      const result = toDate('2024-01-15T10:30:00.000Z', '日期')
      expect(result).toBeInstanceOf(Date)
    })

    it('无效日期应该抛出 ValidationError', () => {
      expect(() => toDate('invalid-date', '日期')).toThrow(ValidationError)
    })

    it('空字符串应该抛出 ValidationError', () => {
      expect(() => toDate('', '日期')).toThrow(ValidationError)
    })
  })

  describe('toOptionalDate', () => {
    it('应该解析有效的日期字符串', () => {
      const result = toOptionalDate('2024-01-15', '日期')
      expect(result).toBeInstanceOf(Date)
    })

    it('null 应该返回 undefined', () => {
      expect(toOptionalDate(null, '日期')).toBeUndefined()
    })

    it('undefined 应该返回 undefined', () => {
      expect(toOptionalDate(undefined, '日期')).toBeUndefined()
    })

    it('空字符串应该返回 undefined', () => {
      expect(toOptionalDate('', '日期')).toBeUndefined()
    })

    it('无效日期应该抛出 ValidationError', () => {
      expect(() => toOptionalDate('invalid', '日期')).toThrow(ValidationError)
    })
  })
})
