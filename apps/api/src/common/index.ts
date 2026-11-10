// Error classes
export {
  AppError,
  NotFoundError,
  ValidationError,
  toApiErrorCode,
} from './error.js'

// Request ID
export { requestId } from './request-id.js'

// HTTP utilities and types
export { asyncHandler, validateRequest, success, errorHandler, notFoundHandler } from './http.js'
export type { ApiResponse } from './http.js'

// Tree utilities (re-exported from packages/contracts/utils/tree — single source of truth)
export { buildTree, buildChildrenMap, collectDescendantIds } from './tree.js'

// Utils
export { toMinor, hasValue, toStringArray, parsePositiveInteger, toDate, toOptionalDate } from './utils.js'

// Validators
export {
  parseMoney,
  validateIdParam,
  parseOptionalUuid,
  parseOptionalIconKey,
  validateBatchSort,
  validateDateRange,
  validateDateQuery,
  validateTypeQuery,
  parseAsOfQuery,
  parseOptionalDateQuery,
  parseBooleanQuery,
  parseProjectionWindowQuery,
} from './validators.js'

// Date utilities
export { dayStart, dayEnd, nextDay, formatDateLocal, parseDateLocal } from './date.js'

// 数据库文件位置
export { resolveDbDirectory } from './db-path.js'

// Logger
export { rootLogger } from './logger/index.js'
