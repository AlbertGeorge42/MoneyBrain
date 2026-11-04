import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// 必须在导入 src/prisma.ts 之前指向测试库
process.env.DATABASE_URL = `file:${path.resolve(__dirname, '../../prisma/test.db')}`

// 数据库目录用假路径隔离：自动备份配置跟着数据库走，不能真的写进 prisma 目录
let fakeDbDir: string
vi.mock('../../src/prisma.js', () => ({
  prisma: {
    $queryRawUnsafe: vi.fn(async () => [{ file: `${fakeDbDir.replaceAll('\\', '/')}/dev.db` }]),
    $disconnect: vi.fn(),
  },
}))

vi.mock('../../src/services/export/index.js', () => ({
  exportFullBackup: vi.fn(async () => Buffer.from('fake-zip-content')),
}))

const {
  evaluateBackupPlan,
  isCloudSyncDirectory,
  getAutoBackupConfig,
  saveAutoBackupConfig,
  runAutoBackupOnce,
  countAutoBackups,
} = await import('../../src/services/auto-backup.service.js')

const MIN = 60_000

const at = (y: number, m: number, d: number, h: number, minute: number) =>
  new Date(y, m - 1, d, h, minute, 0, 0)

/** 组装调度状态：时间参数全部相对 now 的偏移（分钟）。 */
const state = (options: {
  now: Date
  lastRunMinutesAgo?: number | null
  lastAttemptMinutesAgo?: number | null
  busy?: boolean
}) => ({
  now: options.now,
  lastRunAt:
    options.lastRunMinutesAgo === null || options.lastRunMinutesAgo === undefined
      ? null
      : new Date(options.now.getTime() - options.lastRunMinutesAgo * MIN).toISOString(),
  lastAttemptAt:
    options.lastAttemptMinutesAgo === null || options.lastAttemptMinutesAgo === undefined
      ? null
      : new Date(options.now.getTime() - options.lastAttemptMinutesAgo * MIN).toISOString(),
  busy: options.busy ?? false,
})

describe('evaluateBackupPlan（调度策略：24h 间隔 + 长任务锁互斥）', () => {
  const now = at(2026, 11, 2, 12, 0)
  const dueAgo = 25 * 60 // 到期 1 小时

  it('未到期不跑：距上次成功不足 24 小时', () => {
    const decision = evaluateBackupPlan(state({ now, lastRunMinutesAgo: 5 * 60 }))
    expect(decision).toEqual({ action: 'wait', reason: 'not-due' })
  })

  it('到期且锁空闲 → 跑', () => {
    const decision = evaluateBackupPlan(state({ now, lastRunMinutesAgo: dueAgo }))
    expect(decision).toEqual({ action: 'run', reason: 'due' })
  })

  it('从未成功过视为到期：锁空闲即跑（首次备份）', () => {
    const decision = evaluateBackupPlan(state({ now, lastRunMinutesAgo: null }))
    expect(decision).toEqual({ action: 'run', reason: 'due' })
  })

  it('到期但长任务占用中 → 不跑（没有强制分支，超时多久都不跑）；锁释放后立刻跑', () => {
    // 互斥严格生效：到期 3 天也不越过长任务锁
    const blocked = evaluateBackupPlan(
      state({ now, lastRunMinutesAgo: 3 * 24 * 60, busy: true })
    )
    expect(blocked).toEqual({ action: 'wait', reason: 'busy' })

    // 锁释放后的下一轮评估（30 秒粒度）即执行
    const released = evaluateBackupPlan(
      state({ now, lastRunMinutesAgo: 3 * 24 * 60, busy: false })
    )
    expect(released).toEqual({ action: 'run', reason: 'due' })
  })

  it('上次尝试失败后未过退避期 → 等，避免同一窗口反复失败', () => {
    const decision = evaluateBackupPlan(
      state({ now, lastRunMinutesAgo: dueAgo, lastAttemptMinutesAgo: 5 })
    )
    expect(decision).toEqual({ action: 'wait', reason: 'backoff' })
  })

  it('退避期满后恢复执行', () => {
    const decision = evaluateBackupPlan(
      state({ now, lastRunMinutesAgo: dueAgo, lastAttemptMinutesAgo: 11 })
    )
    expect(decision).toEqual({ action: 'run', reason: 'due' })
  })
})

describe('isCloudSyncDirectory（云同步目录判定）', () => {
  it('常见网盘目录判为云同步目录', () => {
    expect(isCloudSyncDirectory('C:/Users/me/OneDrive/backup')).toBe(true)
    expect(isCloudSyncDirectory('D:\\Dropbox\\moneybrain')).toBe(true)
    expect(isCloudSyncDirectory('/Users/me/nutstore/backup')).toBe(true)
    expect(isCloudSyncDirectory('C:\\Users\\me\\百度网盘\\backup')).toBe(true)
  })

  it('普通本地目录不是云同步目录', () => {
    expect(isCloudSyncDirectory('C:\\Users\\me\\backups')).toBe(false)
    expect(isCloudSyncDirectory('/home/me/backups')).toBe(false)
  })
})

describe('自动备份配置（B3 过渡态约束）', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    fakeDbDir = mkdtempSync(join(tmpdir(), 'mb-autobackup-'))
  })

  afterEach(() => {
    vi.useRealTimers()
    rmSync(fakeDbDir, { recursive: true, force: true })
  })

  it('默认配置：未开启，目录指向数据库同级 auto-backups/', async () => {
    const config = await getAutoBackupConfig()
    expect(config.enabled).toBe(false)
    expect(config.directory).toBe(join(fakeDbDir, 'auto-backups'))
  })

  it('开启时云同步目录默认拒绝，显式确认后才接受', async () => {
    const cloudDirectory = 'C:\\Users\\me\\OneDrive\\backups'

    await expect(
      saveAutoBackupConfig({ enabled: true, directory: cloudDirectory })
    ).rejects.toThrow(/云同步目录/)

    const saved = await saveAutoBackupConfig({
      enabled: true,
      directory: cloudDirectory,
      confirmCloudDirectory: true,
    })
    expect(saved.enabled).toBe(true)
    expect((await getAutoBackupConfig()).directory).toBe(cloudDirectory)

    // 关闭后落盘，避免假定时器泄漏到后续用例
    await saveAutoBackupConfig({ enabled: false })
  })

  it('开启时目录必填且必须是绝对路径', async () => {
    await expect(saveAutoBackupConfig({ enabled: true, directory: '  ' })).rejects.toThrow(/备份目录/)
    await expect(
      saveAutoBackupConfig({ enabled: true, directory: 'relative/path' })
    ).rejects.toThrow(/绝对路径/)
  })

  it('执行一次：按日期落盘、保留最近 7 份、记录运行时间', async () => {
    const backupDir = join(fakeDbDir, 'backups')
    mkdirSync(backupDir, { recursive: true })
    // 预置 7 份旧备份，加上本次共 8 份，应删掉最旧的 1 份
    for (let i = 1; i <= 7; i++) {
      writeFileSync(join(backupDir, `moneybrain-backup-2026-01-0${i}.zip`), Buffer.from('old'))
    }

    const configPath = join(fakeDbDir, 'auto-backup-config.json')
    const result = await runAutoBackupOnce({ directory: backupDir, configPath })

    const now = new Date()
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    expect(existsSync(result.file)).toBe(true)
    expect(result.file).toContain(`moneybrain-backup-${today}.zip`)

    const zips = readdirSync(backupDir).filter((name) => name.endsWith('.zip')).sort()
    expect(zips).toHaveLength(7)
    expect(zips).not.toContain('moneybrain-backup-2026-01-01.zip')

    const recorded: { lastRunAt: unknown; lastAttemptAt: unknown; lastRunError: unknown } = JSON.parse(
      readFileSync(configPath, 'utf-8'),
    )
    expect(recorded.lastRunAt).toBeTruthy()
    expect(recorded.lastAttemptAt).toBeTruthy()
    expect(recorded.lastRunError).toBeNull()
  })

  it('countAutoBackups：目录不存在为 0，只数本服务命名的文件', async () => {
    expect(countAutoBackups(join(fakeDbDir, 'missing'))).toBe(0)

    const backupDir = join(fakeDbDir, 'backups')
    mkdirSync(backupDir, { recursive: true })
    writeFileSync(join(backupDir, 'moneybrain-backup-2026-01-01.zip'), Buffer.from('x'))
    writeFileSync(join(backupDir, 'moneybrain-backup-2026-01-02.zip'), Buffer.from('x'))
    writeFileSync(join(backupDir, 'unrelated.txt'), Buffer.from('x'))
    expect(countAutoBackups(backupDir)).toBe(2)
  })
})
