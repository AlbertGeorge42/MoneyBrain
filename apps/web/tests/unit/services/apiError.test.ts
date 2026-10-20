import { describe, it, expect } from 'vitest'
import { ApiClientError, getApiErrorMessage, getApiErrorRequestId, normalizeApiError } from '../../../src/services/apiError'

const createAxiosLikeError = (data: unknown, status?: number): Error => {
  const error = new Error('Request failed')
  Object.assign(error, {
    isAxiosError: true,
    response: status === undefined ? undefined : { status, data },
  })
  return error
}

describe('apiError', () => {
  describe('normalizeApiError', () => {
    it('应该透传后端业务错误', () => {
      const error = normalizeApiError(
        createAxiosLikeError(
          {
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: '金额不能为空',
              details: { field: 'amount' },
              requestId: 'req-1',
            },
          },
          400
        )
      )

      expect(error).toBeInstanceOf(ApiClientError)
      expect(error.code).toBe('VALIDATION_ERROR')
      expect(error.message).toBe('金额不能为空')
      expect(error.details).toEqual({ field: 'amount' })
      expect(error.requestId).toBe('req-1')
      expect(error.status).toBe(400)
    })

    it('未知错误码应该收敛为 UNKNOWN', () => {
      const error = normalizeApiError(
        createAxiosLikeError({ success: false, error: { code: 'WHATEVER', message: '奇怪错误' } }, 500)
      )

      expect(error.code).toBe('UNKNOWN')
      expect(error.message).toBe('奇怪错误')
    })

    it('没有响应时应该归一化为网络错误', () => {
      const error = normalizeApiError(createAxiosLikeError(undefined))

      expect(error.code).toBe('NETWORK_ERROR')
      expect(error.message).toContain('无法连接服务器')
    })

    it('已经是 ApiClientError 时应该原样返回', () => {
      const original = new ApiClientError({ code: 'NOT_FOUND', message: '不存在' })
      expect(normalizeApiError(original)).toBe(original)
    })

    it('普通异常应该归一化为 UNKNOWN', () => {
      const error = normalizeApiError(new Error('普通异常'))
      expect(error.code).toBe('UNKNOWN')
      expect(error.message).toBe('普通异常')
    })
  })

  describe('getApiErrorMessage', () => {
    it('应该返回 ApiClientError 的消息', () => {
      const error = new ApiClientError({ code: 'NOT_FOUND', message: '账户不存在' })
      expect(getApiErrorMessage(error)).toBe('账户不存在')
    })

    it('缺少消息时应该返回兜底文案', () => {
      const error = new ApiClientError({ code: 'INTERNAL_ERROR', message: '' })
      expect(getApiErrorMessage(error, '出错了')).toBe('出错了')
    })

    it('未知异常应该返回兜底文案', () => {
      expect(getApiErrorMessage('not an error', '出错了')).toBe('出错了')
    })
  })

  describe('getApiErrorRequestId', () => {
    it('应该返回请求 ID', () => {
      const error = new ApiClientError({ code: 'INTERNAL_ERROR', message: 'x', requestId: 'req-9' })
      expect(getApiErrorRequestId(error)).toBe('req-9')
    })

    it('没有请求 ID 时应该返回 undefined', () => {
      const error = new ApiClientError({ code: 'INTERNAL_ERROR', message: 'x' })
      expect(getApiErrorRequestId(error)).toBeUndefined()
    })
  })
})
