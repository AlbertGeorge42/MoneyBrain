import { describe, it, expect } from 'vitest'
import {
  AppError,
  NotFoundError,
  ValidationError,
} from '../../src/common/error.js'

describe('error classes', () => {
  describe('AppError', () => {
    it('应该正确设置属性', () => {
      const error = new AppError('测试错误', 'TEST_ERROR', 500)
      expect(error.message).toBe('测试错误')
      expect(error.code).toBe('TEST_ERROR')
      expect(error.statusCode).toBe(500)
      expect(error.name).toBe('AppError')
    })

    it('应该继承 Error', () => {
      const error = new AppError('测试', 'TEST')
      expect(error).toBeInstanceOf(Error)
    })

    it('默认状态码应该是 400', () => {
      const error = new AppError('测试', 'TEST')
      expect(error.statusCode).toBe(400)
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
  })
})
