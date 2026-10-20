import { randomUUID } from 'crypto'
import type { NextFunction, Request, RequestHandler, Response } from 'express'

/** 请求 ID 的头名称（请求与响应共用） */
export const REQUEST_ID_HEADER = 'x-request-id'

/**
 * 为每个请求分配 ID：
 * - 复用上游传入的 x-request-id
 * - 否则生成 UUID
 *
 * 结果同时写入请求头（供 pino-http 复用同一个 ID）与响应头（供前端排查），
 * 并在错误响应体中回传，保证「前端提示 ↔ 后端日志」可对照。
 */
export const requestId: RequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const incoming = req.headers[REQUEST_ID_HEADER]
  const id = typeof incoming === 'string' && incoming.length > 0 ? incoming : randomUUID()
  req.headers[REQUEST_ID_HEADER] = id
  res.setHeader(REQUEST_ID_HEADER, id)
  next()
}

/** 读取当前请求 ID（由 requestId 中间件写入） */
export const getRequestId = (req: Request): string | undefined => {
  const header = req.headers[REQUEST_ID_HEADER]
  if (typeof header === 'string' && header.length > 0) return header
  if (Array.isArray(header) && typeof header[0] === 'string' && header[0].length > 0) {
    return header[0]
  }
  return undefined
}
