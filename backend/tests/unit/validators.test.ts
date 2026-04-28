import { describe, it, expect } from 'vitest'
import { validateIdParam, validateBatchSort, validateDateRange, validateDateQuery, validateTypeQuery } from '../../src/common/validators.js'
import { ValidationError } from '../../src/common/error.js'

describe('validators', () => {
  describe('validateIdParam', () => {
    it('有效的 id 不应该抛出错误', () => {
      const req = { params: { id: '123' } } as any
      expect(() => validateIdParam(req)).not.toThrow()
    })

    it('缺失的 id 应该抛出 ValidationError', () => {
      const req = { params: {} } as any
      expect(() => validateIdParam(req)).toThrow(ValidationError)
    })

    it('空字符串 id 应该抛出 ValidationError', () => {
      const req = { params: { id: '' } } as any
      expect(() => validateIdParam(req)).toThrow(ValidationError)
    })

    it('null id 应该抛出 ValidationError', () => {
      const req = { params: { id: null } } as any
      expect(() => validateIdParam(req)).toThrow(ValidationError)
    })

    it('undefined id 应该抛出 ValidationError', () => {
      const req = { params: { id: undefined } } as any
      expect(() => validateIdParam(req)).toThrow(ValidationError)
    })
  })

  describe('validateBatchSort', () => {
    it('有效的 items 数组不应该抛出错误', () => {
      const req = { body: { items: [{ id: '1', sort: 0 }] } } as any
      expect(() => validateBatchSort(req)).not.toThrow()
    })

    it('缺失 items 应该抛出 ValidationError', () => {
      const req = { body: {} } as any
      expect(() => validateBatchSort(req)).toThrow(ValidationError)
    })

    it('非数组 items 应该抛出 ValidationError', () => {
      const req = { body: { items: 'not-array' } } as any
      expect(() => validateBatchSort(req)).toThrow(ValidationError)
    })

    it('null items 应该抛出 ValidationError', () => {
      const req = { body: { items: null } } as any
      expect(() => validateBatchSort(req)).toThrow(ValidationError)
    })
  })

  describe('validateDateRange', () => {
    it('有效的日期范围不应该抛出错误', () => {
      const req = { query: { startDate: '2024-01-01', endDate: '2024-01-31' } } as any
      expect(() => validateDateRange(req)).not.toThrow()
    })

    it('缺失 startDate 应该抛出 ValidationError', () => {
      const req = { query: { endDate: '2024-01-31' } } as any
      expect(() => validateDateRange(req)).toThrow(ValidationError)
    })

    it('缺失 endDate 应该抛出 ValidationError', () => {
      const req = { query: { startDate: '2024-01-01' } } as any
      expect(() => validateDateRange(req)).toThrow(ValidationError)
    })

    it('空字符串日期应该抛出 ValidationError', () => {
      const req = { query: { startDate: '', endDate: '' } } as any
      expect(() => validateDateRange(req)).toThrow(ValidationError)
    })
  })

  describe('validateDateQuery', () => {
    it('有效的日期参数不应该抛出错误', () => {
      const req = { query: { date: '2024-01-01' } } as any
      expect(() => validateDateQuery(req)).not.toThrow()
    })

    it('缺失 date 应该抛出 ValidationError', () => {
      const req = { query: {} } as any
      expect(() => validateDateQuery(req)).toThrow(ValidationError)
    })

    it('空字符串 date 应该抛出 ValidationError', () => {
      const req = { query: { date: '' } } as any
      expect(() => validateDateQuery(req)).toThrow(ValidationError)
    })
  })

  describe('validateTypeQuery', () => {
    it('有效的 type 参数不应该抛出错误', () => {
      const req = { query: { type: 'income' } } as any
      expect(() => validateTypeQuery(req)).not.toThrow()
    })

    it('缺失 type 应该抛出 ValidationError', () => {
      const req = { query: {} } as any
      expect(() => validateTypeQuery(req)).toThrow(ValidationError)
    })

    it('空字符串 type 应该抛出 ValidationError', () => {
      const req = { query: { type: '' } } as any
      expect(() => validateTypeQuery(req)).toThrow(ValidationError)
    })
  })
})
