const isDev = process.env.NODE_ENV !== 'production'
const isTest = process.env.NODE_ENV === 'test'

export const LOG_CONFIG = {
  level: process.env.LOG_LEVEL || (isTest ? 'warn' : isDev ? 'debug' : 'info'),
  isDev,
  isTest,
  // Pino 内置 redact：仅配置路径，零额外代码
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie', '*.password', '*.token'],
    censor: '[REDACTED]',
  },
  // pino-http 忽略的路径（避免日志噪音）
  ignorePaths: ['/api/health', '/favicon.ico'],
}
