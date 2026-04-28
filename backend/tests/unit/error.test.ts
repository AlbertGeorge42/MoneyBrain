import { describe, it, expect } from 'vitest'
import {
  AppError,
  NotFoundError,
  ValidationError,
  BusinessError,
  InsufficientBalanceError,
  DuplicateError,
  ForeignKeyError,
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

  describe('BusinessError', () => {
    it('应该正确设置属性', () => {
      const error = new BusinessError('业务规则冲突')
      expect(error.message).toBe('业务规则冲突')
      expect(error.code).toBe('BUSINESS_ERROR')
      expect(error.statusCode).toBe(400)
      expect(error.name).toBe('BusinessError')
    })
  })

  describe('InsufficientBalanceError', () => {
    it('应该正确格式化带账户名的消息', () => {
      const error = new InsufficientBalanceError('工资卡')
      expect(error.message).toBe('工资卡余额不足')
      expect(error.code).toBe('INSUFFICIENT_BALANCE')
      expect(error.statusCode).toBe(400)
    })

    it('无账户名时应该使用默认消息', () => {
      const error = new InsufficientBalanceError()
      expect(error.message).toBe('账户余额不足')
    })
  })

  describe('DuplicateError', () => {
    it('应该正确格式化带字段的消息', () => {
      const error = new DuplicateError('账户', '名称')
      expect(error.message).toBe('账户的名称已存在')
      expect(error.code).toBe('DUPLICATE_ERROR')
      expect(error.statusCode).toBe(409)
    })

    it('无字段时应该使用默认消息', () => {
      const error = new DuplicateError('账户')
      expect(error.message).toBe('账户已存在')
    })
  })

  describe('ForeignKeyError', () => {
    it('应该正确格式化消息', () => {
      const error = new ForeignKeyError('分类')
      expect(error.message).toBe('关联的分类不存在')
      expect(error.code).toBe('FOREIGN_KEY_ERROR')
      expect(error.statusCode).toBe(400)
      expect(error.name).toBe('ForeignKeyError')
    })
  })
})
