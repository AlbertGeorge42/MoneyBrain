/**
 * 响应信封的日期序列化（账本日期 = 本地日历日）。
 *
 * 断言三件事：
 * 1. date / startDate / endDate / initialBalanceDate 输出 `YYYY-MM-DD`，不是 ISO；
 * 2. 其它时间戳字段仍保留 ISO 瞬时；
 * 3. 嵌套对象 / 数组里的账本日期同样生效（list、回收站、报表行都靠这一层）。
 *
 * 用例只读本地时区分量，因此在 UTC+8 / UTC-5 / UTC 下跑结果必须一致。
 */
import { describe, it, expect } from 'vitest'
import type { Response } from 'express'
import { success } from '../../src/common/http.js'

interface Captured {
  statusCode: number
  body?: unknown
}

function fakeResponse(): { res: Response; captured: Captured } {
  const captured: Captured = { statusCode: 200 }
  const res = {
    status() {
      return res
    },
    json(payload: unknown) {
      captured.body = payload
      return res
    },
  } as unknown as Response
  return { res, captured }
}

function bodyOf(data: unknown): Record<string, unknown> {
  const { res, captured } = fakeResponse()
  success(res, data)
  return (captured.body as { data: Record<string, unknown> }).data
}

describe('API 日期序列化：账本日期输出本地日历日', () => {
  it('date-only 字段输出 YYYY-MM-DD，时间戳保留 ISO', () => {
    const createdAt = new Date(2026, 11, 31, 23, 30, 15)
    const data = bodyOf({
      date: new Date(2026, 11, 31),
      startDate: new Date(2027, 0, 1),
      endDate: new Date(2026, 11, 31),
      initialBalanceDate: new Date(2026, 0, 1),
      createdAt,
      updatedAt: null,
    })

    expect(data.date).toBe('2026-12-31')
    expect(data.startDate).toBe('2027-01-01')
    expect(data.endDate).toBe('2026-12-31')
    expect(data.initialBalanceDate).toBe('2026-01-01')
    expect(data.createdAt).toBe(createdAt.toISOString())
    expect(data.updatedAt).toBeNull()
  })

  it('嵌套数组里的交易日期同样输出日历日', () => {
    const data = bodyOf({
      list: [
        { id: 'a', date: new Date(2026, 10, 1, 0, 5) },
        { id: 'b', date: new Date(2026, 10, 30, 23, 55) },
      ],
      recentTransactions: [{ id: 'c', date: new Date(2027, 0, 1, 0, 5) }],
    })

    expect((data.list as Array<{ date: string }>).map((item) => item.date)).toEqual([
      '2026-11-01',
      '2026-11-30',
    ])
    expect((data.recentTransactions as Array<{ date: string }>)[0].date).toBe('2027-01-01')
  })

  it('字符串日期原样透传，不会被二次解析', () => {
    const data = bodyOf({ date: '2026-12-31', startDate: '2027-01-01' })
    expect(data.date).toBe('2026-12-31')
    expect(data.startDate).toBe('2027-01-01')
  })
})
