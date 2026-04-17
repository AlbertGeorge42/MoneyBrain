import { Decimal } from '@prisma/client/runtime/library.js'

export const ZERO = new Decimal(0)

export function toDecimal(value: Decimal | number | string | null | undefined): Decimal {
  if (value === null || value === undefined) return ZERO
  if (value instanceof Decimal) return value
  return new Decimal(value)
}

export function sumDecimals(values: (Decimal | number | null | undefined)[]): Decimal {
  return values.reduce<Decimal>((acc, v) => acc.plus(toDecimal(v)), ZERO)
}

export function decimalToNumber(d: Decimal): number {
  return d.toNumber()
}

export function decimalToString(d: Decimal, precision: number = 2): string {
  return d.toFixed(precision)
}
