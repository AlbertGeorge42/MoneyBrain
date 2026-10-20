import pinoHttp from 'pino-http'
import { randomUUID } from 'crypto'
import { rootLogger } from './index.js'
import { LOG_CONFIG } from './config.js'

/**
 * HTTP 请求日志中间件（基于 pino-http）
 * - 自动记录 method / path / statusCode / responseTime / requestId
 * - 忽略健康检查和 favicon 等噪音路径
 * - 4xx → warn, 5xx → error, 其他 → info
 */
export const httpLogger = pinoHttp({
  logger: rootLogger.child({ module: 'http' }),
  // 请求 ID：支持外部传入（x-request-id header），否则自动生成
  genReqId: (req) => req.headers['x-request-id']?.toString() || randomUUID(),
  // 忽略健康检查等噪音路径
  autoLogging: {
    ignore: (req) => LOG_CONFIG.ignorePaths.includes(req.url || ''),
  },
  // 固定消息文本，信息全部放字段
  customSuccessMessage: () => 'request completed',
  customErrorMessage: (_req, _res, err) => `request failed - ${err.message}`,
  // 4xx → warn, 5xx → error, 其他 → info
  customLogLevel: (req, res, err) => {
    if (err || res.statusCode >= 500) return 'error'
    if (res.statusCode >= 400) return 'warn'
    return 'info'
  },
  // 序列化请求/响应（精简，不记录 body；path 不含 query）
  serializers: {
    req: (req) => ({ method: req.method, path: req.path || req.url?.split('?')[0] }),
    res: (res) => ({ statusCode: res.statusCode }),
  },
})
