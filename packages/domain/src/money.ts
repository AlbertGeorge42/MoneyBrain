/**
 * 金额值对象。
 *
 * 领域层只使用「整数分」，避免浮点误差；展示层再转成元。
 * 数据库暂时仍使用 Decimal，由适配层在边界处完成换算。
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

/** 解析用户输入的金额字符串，支持千分位与前后空格。 */
export function parseAmount(input: string | number): Minor {
  if (typeof input === 'number') return fromMajor(input)
  const normalized = input.trim().replace(/,/g, '')
  if (!/^-?\d+(\.\d{0,2})?$/.test(normalized)) {
    throw new RangeError(`金额格式无效: ${input}`)
  }
  return fromMajor(Number(normalized))
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
