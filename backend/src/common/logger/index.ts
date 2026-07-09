import pino from 'pino'
import { LOG_CONFIG } from './config.js'

/**
 * 创建根 logger
 * - 测试环境：WARN 级别，同步输出到 stdout
 * - 开发环境：DEBUG 级别，pino-pretty 格式化输出（worker thread）
 * - 生产环境：INFO 级别，JSON 输出到 stdout（轮转由外部工具处理）
 */
function createRootLogger() {
  if (LOG_CONFIG.isTest) {
    // 测试环境：静默输出（大部分被级别过滤掉）
    return pino({ level: 'warn' }, pino.destination({ sync: true, dest: 1 }))
  }

  if (LOG_CONFIG.isDev) {
    // 开发环境：pino-pretty 格式化输出（worker thread，不阻塞主线程）
    return pino({
      level: LOG_CONFIG.level,
      redact: LOG_CONFIG.redact,
    }, pino.transport({
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:',
        ignore: 'pid,hostname',
        singleLine: true,
        hideObject: false,
      },
    }))
  }

  // 生产环境：JSON 到 stdout（轮转由 PM2/Docker/logrotate 等外部工具处理）
  return pino({
    level: LOG_CONFIG.level,
    redact: LOG_CONFIG.redact,
  }, pino.destination({ dest: 1 }))
}

export const rootLogger = createRootLogger()
