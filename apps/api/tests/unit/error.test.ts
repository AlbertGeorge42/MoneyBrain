import { describe, it, expect } from 'vitest'
import {
  AppError,
  NotFoundError,
  ValidationError,
  isApiErrorCode,
  toApiErrorCode,
} from '../../src/common/error.js'

describe('error classes', () => {
  describe('AppError', () => {
    it('应该正确设置属性', () => {
      const error = new AppError('测试错误', 'INTERNAL_ERROR', 500)
      expect(error.message).toBe('测试错误')
      expect(error.code).toBe('INTERNAL_ERROR')
      expect(error.statusCode).toBe(500)
      expect(error.name).toBe('AppError')
    })

    it('应该继承 Error', () => {
      const error = new AppError('测试', 'UNKNOWN')
      expect(error).toBeInstanceOf(Error)
    })

    it('默认状态码应该是 400', () => {
      const error = new AppError('测试', 'UNKNOWN')
      expect(error.statusCode).toBe(400)
    })

    it('应该携带结构化 details', () => {
      const error = new AppError('字段错误', 'VALIDATION_ERROR', 400, { field: 'amount' })
      expect(error.details).toEqual({ field: 'amount' })
    })

    it('未提供 details 时应为 undefined', () => {
      const error = new AppError('测试', 'UNKNOWN')
      expect(error.details).toBeUndefined()
    })
  })

  describe('NotFoundError', () => {
    it('应该正确格式化消息', () => {
      const error = new NotFoundError('账户')
      expect(error.message).toBe('账户不存在')
      expect(error.code).toBe('NOT_FOUND')
      expect(error.statusCode).toBe(404)
      expect(error.name).toBe('NotFoundError')
    })

    it('应该继承 AppError', () => {
      const error = new NotFoundError('测试')
      expect(error).toBeInstanceOf(AppError)
    })
  })

  describe('ValidationError', () => {
    it('应该正确设置属性', () => {
      const error = new ValidationError('名称不能为空')
      expect(error.message).toBe('名称不能为空')
      expect(error.code).toBe('VALIDATION_ERROR')
      expect(error.statusCode).toBe(400)
      expect(error.name).toBe('ValidationError')
    })

    it('应该继承 AppError', () => {
      const error = new ValidationError('测试')
      expect(error).toBeInstanceOf(AppError)
    })

    it('应该透传 details', () => {
      const error = new ValidationError('参数错误', { field: 'date' })
      expect(error.details).toEqual({ field: 'date' })
    })
  })

  describe('错误码归一化', () => {
    it('已知错误码应该被识别', () => {
      expect(isApiErrorCode('NOT_FOUND')).toBe(true)
      expect(isApiErrorCode('VALIDATION_ERROR')).toBe(true)
    })

    it('未知错误码应该被拒绝', () => {
      expect(isApiErrorCode('WHATEVER')).toBe(false)
    })

    it('toApiErrorCode 应该保留已知错误码', () => {
      expect(toApiErrorCode('DUPLICATE_ERROR')).toBe('DUPLICATE_ERROR')
    })

    it('toApiErrorCode 应该把未知错误码收敛为 UNKNOWN', () => {
      expect(toApiErrorCode('SOMETHING_ELSE')).toBe('UNKNOWN')
      expect(toApiErrorCode(undefined)).toBe('UNKNOWN')
    })
  })
})
