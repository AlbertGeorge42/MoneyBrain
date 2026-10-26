import { minor, type Minor } from '../../../../packages/domain/src/index.js'
import { ValidationError } from './error.js'

// ─── CSV ───

/**
 * 转义 CSV 字段值
 */
export function escapeCsvField(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ''
  const str = String(value)
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

// ─── 金额 ───

/**
 * Prisma 的 BigInt（分）→ 领域 Minor（分）。
 * 超过 2^53 分（90 万亿元）时 `minor()` 会直接失败，不会静默丢精度。
 */
export function toMinor(value: bigint | number | null | undefined): Minor {
  return minor(Number(value ?? 0))
}

export const hasValue = (value: unknown): boolean => 
  value !== undefined && value !== null && value !== ''

export const toStringArray = (value: unknown): string[] | undefined => {
  if (!hasValue(value)) {
    return undefined
  }

  if (Array.isArray(value)) {
    return value.map(item => String(item))
  }

  return [String(value)]
}

export const parsePositiveInteger = (value: unknown, fieldName: string, defaultValue: number): number => {
  if (!hasValue(value)) {
    return defaultValue
  }

  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new ValidationError(`${fieldName}必须是正整数`)
  }

  return parsed
}

export const toDate = (value: unknown, fieldName: string): Date => {
  const date = new Date(String(value))
  if (Number.isNaN(date.getTime())) {
    throw new ValidationError(`${fieldName}格式错误`)
  }
  return date
}

export const toOptionalDate = (value: unknown, fieldName: string): Date | undefined => {
  if (!hasValue(value)) {
    return undefined
  }
  return toDate(value, fieldName)
}
