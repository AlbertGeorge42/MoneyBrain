import { describe, it, expect, afterAll } from 'vitest'

const { prisma } = await import('../../src/prisma.js')
const { runExclusiveLongTask } = await import('../../src/services/auto-backup.service.js')

// D6 验收：两个标签页（多个写入方）同时写不报 "database is locked"。
// 覆盖四层事实：
// 1. prisma.ts 启动时把库切到 WAL（journal_mode 是库级持久属性）；
// 2. busy_timeout 已显式固定为 5000ms（写锁竞争排队而非立即失败）；
// 3. 单客户端多路并发写（模拟多标签页请求打到同一后端）全部成功；
// 4. runExclusiveLongTask 是真串行队列（秒级长任务不互相抢库级写锁）。
//
// SQLite 单写者是本质约束：WAL 不改变写-写串行，它消除的是写对读的阻塞；
// 写-写等待由 busy_timeout 排队兜底，长任务之间的排队由 runExclusiveLongTask 保证。

const benchName = (i: number) => `__d6_bench_${Date.now()}_${i}`

const benchAccounts = () => prisma.account.findMany({
  where: { name: { startsWith: '__d6_bench_' } },
  select: { id: true },
})

async function createBenchAccount(name: string) {
  await prisma.account.create({
    data: {
      name,
      type: 'asset',
      initialBalance: BigInt(0),
      initialBalanceDate: new Date(),
      sort: 990000,
    },
  })
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

afterAll(async () => {
  await prisma.account.deleteMany({ where: { name: { startsWith: '__d6_bench_' } } })
  await prisma.$disconnect()
})

describe('D6：SQLite 并发写（WAL + busy_timeout + 长任务串行化）', () => {
  it('启动时已切换到 WAL 模式', async () => {
    const rows = await prisma.$queryRawUnsafe<{ journal_mode: string }[]>('PRAGMA journal_mode')
    expect(rows[0].journal_mode).toBe('wal')
  })

  it('busy_timeout 显式固定为 5000ms（写锁竞争排队等待）', async () => {
    const rows = await prisma.$queryRawUnsafe<{ timeout: bigint }[]>('PRAGMA busy_timeout')
    expect(Number(rows[0].timeout)).toBeGreaterThanOrEqual(5000)
  })

  it('单客户端 8 路并发写全部成功（多标签页 → 同一后端进程）', async () => {
    const stamp = Date.now()
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        createBenchAccount(`__d6_bench_${stamp}_${i}`)
          .then(() => ({ ok: true }))
          .catch((err) => ({ ok: false, message: String(err).slice(0, 160) })),
      ),
    )
    const failed = results.filter((r) => !r.ok)
    expect(failed).toEqual([])
    // 没有任何 "database is locked" / SQLITE_BUSY 失败
    expect(results.every((r) => r.ok)).toBe(true)
    const rows = await benchAccounts()
    expect(rows.length).toBeGreaterThanOrEqual(8)
  })

  it('长任务串行队列：并发提交的两个长任务不重叠', async () => {
    const stamp = Date.now()
    const windows: Array<{ start: number; end: number }> = []
    const tracked = async () => {
      const run = runExclusiveLongTask(async () => {
        const start = Date.now()
        await sleep(250)
        windows.push({ start, end: Date.now() })
      })
      await run
    }
    const started = Date.now()
    await Promise.all([tracked(), tracked()])
    const elapsed = Date.now() - started

    // 串行：两段执行窗口不重叠，总耗时 ≈ 2 × 单任务时长
    expect(windows).toHaveLength(2)
    windows.sort((a, b) => a.start - b.start)
    expect(windows[0].end).toBeLessThanOrEqual(windows[1].start)
    expect(elapsed).toBeGreaterThanOrEqual(450)
    expect(stamp).toBeGreaterThan(0)
  })

  it('长任务失败不阻塞队列中的后续长任务', async () => {
    const second: string[] = []
    const first = runExclusiveLongTask(async () => {
      await sleep(100)
      throw new Error('long task failed')
    })
    const secondTask = runExclusiveLongTask(async () => {
      second.push('ran')
    })
    await expect(first).rejects.toThrow('long task failed')
    await secondTask
    expect(second).toEqual(['ran'])
  })
})
