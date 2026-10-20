import { describe, it, expect } from 'vitest'
import type { AxiosResponse } from 'axios'
import type { ApiResponse } from '@contracts/types'
import { unwrapApiData } from '../../../src/services/apiResult'
import { ApiClientError } from '../../../src/services/apiError'

const createResponse = <T>(body: ApiResponse<T>): AxiosResponse<ApiResponse<T>> =>
  ({ data: body, status: 200 } as AxiosResponse<ApiResponse<T>>)

describe('unwrapApiData', () => {
  it('成功时应该返回 data', () => {
    const result = unwrapApiData(createResponse({ success: true, data: [1, 2, 3], timestamp: 'now' }))
    expect(result).toEqual([1, 2, 3])
  })

  it('失败时应该抛出 ApiClientError', () => {
    expect(() =>
      unwrapApiData(
        createResponse({
          success: false,
          error: { code: 'NOT_FOUND', message: '账户不存在', requestId: 'req-2' },
          timestamp: 'now',
        })
      )
    ).toThrow(ApiClientError)
  })

  it('失败时应该保留错误码、文案与请求 ID', () => {
    try {
      unwrapApiData(
        createResponse({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: '金额不能为空', details: { field: 'amount' } },
          timestamp: 'now',
        })
      )
      throw new Error('应该抛出 ApiClientError')
    } catch (error) {
      expect(error).toBeInstanceOf(ApiClientError)
      const apiError = error as ApiClientError
      expect(apiError.code).toBe('VALIDATION_ERROR')
      expect(apiError.message).toBe('金额不能为空')
      expect(apiError.details).toEqual({ field: 'amount' })
    }
  })
})
