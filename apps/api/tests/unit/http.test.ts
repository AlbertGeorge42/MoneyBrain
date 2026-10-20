import { describe, it, expect, vi } from 'vitest'
import type { NextFunction, Request, Response } from 'express'
import { errorHandler, notFoundHandler, success } from '../../src/common/http.js'
import { AppError, ValidationError } from '../../src/common/error.js'
import { REQUEST_ID_HEADER } from '../../src/common/request-id.js'

interface MockResponse {
  statusCode: number | null
  body: unknown
  status: (code: number) => MockResponse
  json: (payload: unknown) => MockResponse
}

const createMockResponse = (): MockResponse => {
  const res: MockResponse = {
    statusCode: null,
    body: undefined,
    status(code: number) {
      res.statusCode = code
      return res
    },
    json(payload: unknown) {
      res.body = payload
      return res
    },
  }
  return res
}

const createMockRequest = (requestId?: string): Request => {
  const headers: Record<string, string | string[]> = requestId
    ? { [REQUEST_ID_HEADER]: requestId }
    : {}
  return {
    method: 'GET',
    path: '/api/unknown',
    originalUrl: '/api/unknown',
    ip: '127.0.0.1',
    headers,
  } as unknown as Request
}

describe('http 响应封装', () => {
  describe('success', () => {
    it('应该返回 success=true 与数据', () => {
      const res = createMockResponse()
      success(res as unknown as Response, { id: '1' })

      expect(res.statusCode).toBe(200)
      expect(res.body).toMatchObject({
        success: true,
        data: { id: '1' },
      })
      expect((res.body as { timestamp: string }).timestamp).toBeTruthy()
    })
  })

  describe('notFoundHandler', () => {
    it('未匹配的路由应该返回统一错误信封', () => {
      const res = createMockResponse()
      notFoundHandler(createMockRequest('req-404'), res as unknown as Response, vi.fn() as NextFunction)

      expect(res.statusCode).toBe(404)
      expect(res.body).toMatchObject({
        success: false,
        error: {
          code: 'NOT_FOUND',
          requestId: 'req-404',
        },
      })
    })
  })

  describe('errorHandler', () => {
    it('AppError 应该返回统一的错误结构', () => {
      const res = createMockResponse()
      errorHandler(
        new AppError('账户不存在', 'NOT_FOUND', 404),
        createMockRequest(),
        res as unknown as Response,
        vi.fn() as NextFunction
      )

      expect(res.statusCode).toBe(404)
      expect(res.body).toMatchObject({
        success: false,
        error: { code: 'NOT_FOUND', message: '账户不存在' },
      })
    })

    it('应该透传 details', () => {
      const res = createMockResponse()
      errorHandler(
        new ValidationError('参数错误', { field: 'amount' }),
        createMockRequest(),
        res as unknown as Response,
        vi.fn() as NextFunction
      )

      expect(res.body).toMatchObject({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: '参数错误',
          details: { field: 'amount' },
        },
      })
    })

    it('应该回传请求 ID', () => {
      const res = createMockResponse()
      errorHandler(
        new AppError('内部错误', 'INTERNAL_ERROR', 500),
        createMockRequest('req-123'),
        res as unknown as Response,
        vi.fn() as NextFunction
      )

      expect(res.body).toMatchObject({
        success: false,
        error: { requestId: 'req-123' },
      })
    })

    it('未知异常应该收敛为 INTERNAL_ERROR', () => {
      const res = createMockResponse()
      errorHandler(
        new Error('boom'),
        createMockRequest(),
        res as unknown as Response,
        vi.fn() as NextFunction
      )

      expect(res.statusCode).toBe(500)
      expect(res.body).toMatchObject({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'boom' },
      })
    })

    it('第三方错误码应该被收敛到受支持的错误码', () => {
      const res = createMockResponse()
      const thirdParty = Object.assign(new Error('第三方错误'), { code: 'ECONNREFUSED' })

      errorHandler(
        thirdParty,
        createMockRequest(),
        res as unknown as Response,
        vi.fn() as NextFunction
      )

      expect(res.body).toMatchObject({
        success: false,
        error: { code: 'UNKNOWN', message: '第三方错误' },
      })
    })
  })
})
