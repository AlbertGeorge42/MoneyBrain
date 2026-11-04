import { describe, it, expect, vi, afterEach } from 'vitest'
import { todayFilename } from '../../src/utils/download'

describe('todayFilename', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  // 用本地时间构造临界点：无论测试机在哪个时区，这两个时刻都属于同一天。
  it('本地 00:30 下载：文件名用当天，不退到 UTC 的前一天', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 2, 1, 0, 30, 0))

    expect(todayFilename('moneybrain-backup', 'zip')).toBe('moneybrain-backup-2026-03-01.zip')
  })

  it('本地 23:30 下载：文件名仍是当天', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 2, 1, 23, 30, 0))

    expect(todayFilename('moneybrain-backup', 'zip')).toBe('moneybrain-backup-2026-03-01.zip')
  })
})
