// Error classes
export {
  AppError,
  NotFoundError,
  ValidationError,
} from './error.js'

// HTTP utilities and types
export { asyncHandler, validateRequest, success, errorHandler } from './http.js'
export type { ApiResponse } from './http.js'

// Tree utilities (re-exported from packages/contracts/utils/tree — single source of truth)
export { buildTree, buildChildrenMap, collectDescendantIds } from './tree.js'
export type { TreeNode } from './tree.js'

// Utils
export { ZERO, toDecimal, hasValue, toStringArray, parsePositiveInteger, toDate, toOptionalDate } from './utils.js'

// Validators
export { validateIdParam, validateBatchSort, validateDateRange, validateDateQuery, validateTypeQuery } from './validators.js'

// Date utilities
export { dayStart, dayEnd, nextDay, formatDateLocal } from './date.js'

// Logger
export { rootLogger } from './logger/index.js'
