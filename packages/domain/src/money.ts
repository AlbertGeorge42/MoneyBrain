/**
 * 金额值对象。
 *
 * 全链路（数据库、API、前端）只用「整数分」，避免浮点误差。
 * 只有用户输入框与文件（CSV/备份）在边界处按元读写。
 */

export type Minor = number & { readonly __brand: 'Minor' }

export const ZERO_MINOR = 0 as Minor

/** 构造一个整数分金额；非整数或超出安全范围时立即失败。 */
export function minor(value: number): Minor {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`金额必须是整数分，收到: ${value}`)
  }
  return value as Minor
}

/** 元 → 分。仅用于导入/展示边界。 */
export function fromMajor(value: number): Minor {
  if (!Number.isFinite(value)) {
    throw new RangeError(`金额无效: ${value}`)
  }
  return minor(Math.round(value * 100))
}

/** 分 → 元。仅用于展示/序列化边界。 */
export function toMajor(value: Minor): number {
  return value / 100
}

/**
 * 解析用户输入的金额字符串（元），支持千分位与前后空格。
 *
 * 按小数点做字符串解析，绝不经过浮点：`8.115 * 100` 会得到 `811.4999…`。
 * 最多两位小数，超出直接失败——静默舍入等于悄悄改钱。
 */
export function parseAmount(input: string | number): Minor {
  // number 只接受旧数据（元），例如早期备份里的数字金额
  if (typeof input === 'number') return fromMajor(input)
  const normalized = input.trim().replace(/,/g, '')
  const match = /^(-?)(\d{1,14})(?:\.(\d{1,2}))?$/.exec(normalized)
  if (!match) {
    throw new RangeError(`金额格式无效（最多两位小数）: ${input}`)
  }
  const [, sign, integerPart, fractionPart = ''] = match
  const cents = Number(integerPart) * 100 + Number(fractionPart.padEnd(2, '0'))
  return minor(sign === '-' ? -cents : cents)
}

/** 分 → 元字符串（固定两位小数，不带千分位），用于文件导出。 */
export function formatAmount(value: Minor): string {
  const abs = Math.abs(value)
  const sign = value < 0 ? '-' : ''
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`
}

export function add(a: Minor, b: Minor): Minor {
  return minor(a + b)
}

export function sub(a: Minor, b: Minor): Minor {
  return minor(a - b)
}

export function neg(a: Minor): Minor {
  return minor(-a)
}

export function sum(values: readonly Minor[]): Minor {
  return minor(values.reduce((total, value) => total + value, 0))
}

export function max(a: Minor, b: Minor): Minor {
  return a >= b ? a : b
}

export function min(a: Minor, b: Minor): Minor {
  return a <= b ? a : b
}

export function isZero(value: Minor): boolean {
  return value === 0
}

export function isNegative(value: Minor): boolean {
  return value < 0
}
