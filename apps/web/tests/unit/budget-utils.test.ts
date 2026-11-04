import dayjs from 'dayjs'
import { describe, expect, it } from 'vitest'
import { toBudgetDate } from '../../src/utils/budget'

describe('toBudgetDate', () => {
  // 用本地时间构造临界点：任意时区下都属于同一天。
  it('本地 00:30 提交预算日期时不退到 UTC 的前一天', () => {
    expect(toBudgetDate(dayjs(new Date(2026, 2, 1, 0, 30, 0)))).toBe('2026-03-01')
  })

  it('本地 23:30 提交预算日期时仍是当天', () => {
    expect(toBudgetDate(dayjs(new Date(2026, 2, 1, 23, 30, 0)))).toBe('2026-03-01')
  })
})
