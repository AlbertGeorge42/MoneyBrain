import { describe, it, expect } from 'vitest'
import type { Request } from 'express'
import { requestId, getRequestId, REQUEST_ID_HEADER } from '../../src/common/request-id.js'

interface MockRequest {
  headers: Record<string, string | string[] | undefined>
}

interface MockResponse {
  headers: Record<string, string>
  setHeader: (name: string, value: string) => void
}

const createMockRequest = (incoming?: string): { req: MockRequest; res: MockResponse } => {
  const req: MockRequest = { headers: {} }
  if (incoming) req.headers[REQUEST_ID_HEADER] = incoming
  const res: MockResponse = {
    headers: {},
    setHeader(name: string, value: string) {
      res.headers[name] = value
    },
  }
  return { req, res }
}

describe('request id', () => {
  it('应该复用上游传入的请求 ID', () => {
    const { req, res } = createMockRequest('abc-123')

    requestId(req as unknown as Request, res as never, () => undefined)

    expect(req.headers[REQUEST_ID_HEADER]).toBe('abc-123')
    expect(res.headers[REQUEST_ID_HEADER]).toBe('abc-123')
  })

  it('缺少请求 ID 时应该生成 UUID', () => {
    const { req, res } = createMockRequest()

    requestId(req as unknown as Request, res as never, () => undefined)

    const generated = req.headers[REQUEST_ID_HEADER]
    expect(typeof generated).toBe('string')
    expect(generated).toMatch(/^[0-9a-f-]{36}$/)
    expect(res.headers[REQUEST_ID_HEADER]).toBe(generated)
  })

  it('getRequestId 应该读取当前请求 ID', () => {
    const { req, res } = createMockRequest('req-42')
    requestId(req as unknown as Request, res as never, () => undefined)

    expect(getRequestId(req as unknown as Request)).toBe('req-42')
  })

  it('没有请求 ID 时应该返回 undefined', () => {
    expect(getRequestId({ headers: {} } as unknown as Request)).toBeUndefined()
  })
})
