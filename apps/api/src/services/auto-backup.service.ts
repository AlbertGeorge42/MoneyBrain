// ─── 自动定时备份（B3） ───
//
// 备份时机由内部策略决定，用户只设置开关、目录、间隔与保留份数。
// 调度判定只有两条：
//   1. 距上次成功备份 ≥ intervalHours（缺省 24 小时；从未成功视为已到期）；
//   2. 长任务锁空闲（无导入/导出/回滚进行中）。
// 两条都满足就执行，否则等下一轮（30 秒评估一次）；
// 备份与导入/导出/回滚共用同一把长任务锁（runExclusiveLongTask），严格互斥、
// 没有强制越过——长任务结束后下一个评估轮次自动补跑。
//
// F5 已落地：导出的是加密容器（.mbx），写入网盘 / 云同步目录不再产生明文泄露，
// 因此目录限制放开，用户可把自动备份直接指向自己的网盘目录。

import { existsSync, mkdirSync, readdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { formatDateLocal, resolveDbDirectory, rootLogger, ValidationError } from '../common/index.js'
import { exportFullBackup } from './export/index.js'

const logger = rootLogger.child({ module: 'auto-backup' })

// ===== 默认策略常量 =====

/** 默认备份间隔（小时）：旧配置文件没有该字段时回落。 */
export const DEFAULT_INTERVAL_HOURS = 24
/** 默认目录内保留份数：旧配置文件没有该字段时回落。 */
export const DEFAULT_KEEP_COUNT = 7

const MS_PER_HOUR = 60 * 60_000
/** 尝试失败后的退避间隔：避免连续失败在同一个窗口里反复刷日志。 */
const ATTEMPT_BACKOFF_MS = 10 * 60_000
/** 调度循环的评估周期。 */
const TICK_INTERVAL_MS = 30_000

// ===== 配置 =====

/** 配置文件跟着数据库走：数据库在哪，配置就在哪（与回滚点同一套哲学）。 */
const CONFIG_FILENAME = 'auto-backup-config.json'

/** 默认写到数据库同级的 auto-backups/ 目录。 */
const DEFAULT_SUBDIRECTORY = 'auto-backups'

export interface AutoBackupConfigFile {
  enabled: boolean
  /** 备份目标目录（绝对路径） */
  directory: string
  /** 备份间隔（正整数小时） */
  intervalHours: number
  /** 目录内保留份数（正整数） */
  keepCount: number
  /** 上次成功执行时间（ISO 字符串；从未执行为 null） */
  lastRunAt: string | null
  /** 上次尝试执行时间（成功或失败都算；用于失败退避） */
  lastAttemptAt: string | null
  /** 上次执行失败原因（成功后清空） */
  lastRunError: string | null
}

const DEFAULT_CONFIG: AutoBackupConfigFile = {
  enabled: false,
  directory: '',
  intervalHours: DEFAULT_INTERVAL_HOURS,
  keepCount: DEFAULT_KEEP_COUNT,
  lastRunAt: null,
  lastAttemptAt: null,
  lastRunError: null,
}

/** 正整数（小时 / 份数）校验。 */
function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

async function resolveConfigPath(): Promise<string> {
  return join(await resolveDbDirectory(), CONFIG_FILENAME)
}

async function defaultDirectory(): Promise<string> {
  return join(await resolveDbDirectory(), DEFAULT_SUBDIRECTORY)
}

/** 读取配置；文件缺失或损坏时返回默认值（自动备份默认关闭）。 */
export async function getAutoBackupConfig(): Promise<AutoBackupConfigFile & { defaultDirectory: string }> {
  const configPath = await resolveConfigPath()
  const fallbackDirectory = await defaultDirectory()
  if (!existsSync(configPath)) {
    return { ...DEFAULT_CONFIG, directory: fallbackDirectory, defaultDirectory: fallbackDirectory }
  }
  try {
    const raw: unknown = JSON.parse(readFileSync(configPath, 'utf-8'))
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new Error('not a plain object')
    }
    const parsed = raw as Partial<AutoBackupConfigFile>
    return {
      enabled: parsed.enabled === true,
      directory: typeof parsed.directory === 'string' && parsed.directory ? parsed.directory : fallbackDirectory,
      // 旧配置文件没有这两个字段（或值非法）时按默认值工作，不做迁移
      intervalHours: isPositiveInteger(parsed.intervalHours) ? parsed.intervalHours : DEFAULT_INTERVAL_HOURS,
      keepCount: isPositiveInteger(parsed.keepCount) ? parsed.keepCount : DEFAULT_KEEP_COUNT,
      lastRunAt: typeof parsed.lastRunAt === 'string' ? parsed.lastRunAt : null,
      lastAttemptAt: typeof parsed.lastAttemptAt === 'string' ? parsed.lastAttemptAt : null,
      lastRunError: typeof parsed.lastRunError === 'string' ? parsed.lastRunError : null,
      defaultDirectory: fallbackDirectory,
    }
  } catch {
    logger.warn('auto backup config unreadable, falling back to defaults')
    return { ...DEFAULT_CONFIG, directory: fallbackDirectory, defaultDirectory: fallbackDirectory }
  }
}

/** 校验并保存配置；保存后重启调度（间隔变化也会生效）。 */
export async function saveAutoBackupConfig(
  input: {
    enabled?: boolean
    directory?: string
    intervalHours?: number
    keepCount?: number
  },
  configPath?: string
): Promise<AutoBackupConfigFile & { defaultDirectory: string }> {
  const current = await getAutoBackupConfig()
  const next: AutoBackupConfigFile = {
    enabled: input.enabled ?? current.enabled,
    directory: input.directory ?? current.directory,
    intervalHours: input.intervalHours ?? current.intervalHours,
    keepCount: input.keepCount ?? current.keepCount,
    lastRunAt: current.lastRunAt,
    lastAttemptAt: current.lastAttemptAt,
    lastRunError: current.lastRunError,
  }

  if (next.enabled && !next.directory.trim()) {
    throw new ValidationError('请先填写备份目录')
  }
  if (next.enabled && !/^([A-Za-z]:[\\/]|\\\\|\/)/.test(next.directory.trim())) {
    throw new ValidationError('备份目录必须是绝对路径，例如 C:\\Users\\me\\backups')
  }
  // 非法值明确报错，不静默夹取——用户填 0 就该看到错误，而不是被改成 1。
  if (!isPositiveInteger(next.intervalHours)) {
    throw new ValidationError('备份间隔必须是正整数小时')
  }
  if (!isPositiveInteger(next.keepCount)) {
    throw new ValidationError('保留份数必须是正整数')
  }
  const target = configPath ?? (await resolveConfigPath())
  writeFileSync(target, JSON.stringify(next, null, 2), 'utf-8')
  await restartScheduler()
  return { ...next, defaultDirectory: await defaultDirectory() }
}

// ===== 调度判定（纯函数，可单测） =====

export interface BackupScheduleState {
  now: Date
  /** 上次成功备份时间；null = 从未成功（视为已到期，首次备份尽快） */
  lastRunAt: string | null
  /** 上次尝试时间（成功或失败）；用于失败退避 */
  lastAttemptAt: string | null
  /** 备份间隔（正整数小时） */
  intervalHours: number
  /** 长任务锁是否被导入/导出/回滚占用 */
  busy: boolean
}

export type BackupDecision =
  | { action: 'run'; reason: 'due' }
  | { action: 'wait'; reason: 'not-due' | 'busy' | 'backoff' }

/**
 * 备份策略判定（执行时刻由内部策略决定，用户只配置间隔）：
 * 1. 未到期（距上次成功 < intervalHours）→ 等下一轮；
 * 2. 长任务锁被占用 → 等（严格互斥，没有强制越过；锁释放后下一轮自动补跑）；
 * 3. 上次尝试失败后未过退避期 → 等；
 * 4. 其余（到期且锁空闲）→ 执行。
 */
export function evaluateBackupPlan(state: BackupScheduleState): BackupDecision {
  const { now, lastRunAt, lastAttemptAt, intervalHours, busy } = state
  const lastRunMs = lastRunAt ? new Date(lastRunAt).getTime() : 0
  const dueAtMs = lastRunMs + intervalHours * MS_PER_HOUR

  if (lastRunAt && now.getTime() < dueAtMs) {
    return { action: 'wait', reason: 'not-due' }
  }

  if (busy) {
    return { action: 'wait', reason: 'busy' }
  }

  if (lastAttemptAt && now.getTime() < new Date(lastAttemptAt).getTime() + ATTEMPT_BACKOFF_MS) {
    return { action: 'wait', reason: 'backoff' }
  }

  return { action: 'run', reason: 'due' }
}

// ===== 长任务锁 =====

let longTaskCount = 0

/**
 * 长任务串行队列（D6 写串行化的唯一一层）：导入 / 导出 / 回滚恢复 / 自动备份
 * 这些秒级大事务严格串行——它们互相抢库级写锁时只靠 busy_timeout 兜底会超时失败，
 * 排队后后到者等前序完成后才开写。用户写入（毫秒级）不进此队列，
 * 由 Prisma 单客户端内部排队与 busy_timeout 处理。
 */
let longTaskTail: Promise<unknown> = Promise.resolve()

export async function runExclusiveLongTask<T>(task: () => Promise<T>): Promise<T> {
  longTaskCount++
  const run = longTaskTail.then(task, task)
  // 失败不阻塞后续长任务
  longTaskTail = run.then(
    () => undefined,
    () => undefined,
  )
  try {
    return await run
  } finally {
    longTaskCount--
  }
}

// ===== 执行 =====

/** 本服务产生的备份文件：新格式 .mbx；历史明文 .zip 一起计入，避免旧文件永远不清理。 */
function isAutoBackupFile(name: string): boolean {
  return name.startsWith('moneybrain-backup-') && (name.endsWith('.mbx') || name.endsWith('.zip'))
}

/** 统计目录内现有备份份数（新旧格式都算）。 */
export function countAutoBackups(directory: string): number {
  if (!existsSync(directory)) {
    return 0
  }
  return readdirSync(directory).filter(isAutoBackupFile).length
}

/** 执行一次自动备份：导出加密容器、按日期命名落盘、更新运行状态、清理超限旧备份。 */
export async function runAutoBackupOnce(
  options: { directory?: string; configPath?: string } = {}
): Promise<{ file: string }> {
  const config = await getAutoBackupConfig()
  const directory = options.directory ?? config.directory
  if (!directory) {
    throw new ValidationError('备份目录未配置')
  }

  mkdirSync(directory, { recursive: true })
  const filename = `moneybrain-backup-${formatDateLocal(new Date())}.mbx`
  const target = join(directory, filename)
  const attemptedAt = new Date().toISOString()

  try {
    const buffer = await exportFullBackup()
    writeFileSync(target, buffer)
  } catch (error) {
    await recordRunResult(options.configPath, attemptedAt, config.lastRunAt, error instanceof Error ? error.message : String(error))
    throw error
  }

  pruneOldBackups(directory, filename, config.keepCount)
  await recordRunResult(options.configPath, attemptedAt, attemptedAt, null)
  logger.info({ action: 'run', file: target }, 'auto backup created')
  return { file: target }
}

/** 只保留最近 keepCount 份（含刚写的那份），删除更旧的。 */
function pruneOldBackups(directory: string, keepFilename: string, keepCount: number): void {
  const files = readdirSync(directory).filter(isAutoBackupFile).sort()
  // 刚写的当天文件名排序在最后；多出来的（超过上限的）是最旧的
  const excess = files.length - keepCount
  for (let i = 0; i < excess; i++) {
    if (files[i] === keepFilename) continue
    rmSync(join(directory, files[i]))
  }
}

/** 把运行状态写回配置文件；configPath 供测试注入，缺省写真实配置。 */
async function recordRunResult(
  configPath: string | undefined,
  attemptedAt: string,
  lastRunAt: string | null,
  lastRunError: string | null
): Promise<void> {
  const config = await getAutoBackupConfig()
  const target = configPath ?? (await resolveConfigPath())
  writeFileSync(
    target,
    JSON.stringify({ ...config, lastAttemptAt: attemptedAt, lastRunAt, lastRunError }, null, 2),
    'utf-8'
  )
}

// ===== 调度循环 =====

let ticker: ReturnType<typeof setInterval> | null = null
let running = false

function stopTicker(): void {
  if (ticker) {
    clearInterval(ticker)
    ticker = null
  }
}

/** 一次评估：到期且长任务锁空闲就执行；执行中的请求不并发重入。 */
async function tick(): Promise<void> {
  if (running) {
    return
  }
  const config = await getAutoBackupConfig()
  if (!config.enabled) {
    stopTicker()
    return
  }

  const decision = evaluateBackupPlan({
    now: new Date(),
    lastRunAt: config.lastRunAt,
    lastAttemptAt: config.lastAttemptAt,
    intervalHours: config.intervalHours,
    busy: longTaskCount > 0,
  })

  if (decision.action === 'wait') {
    return
  }

  running = true
  try {
    await runAutoBackupOnce()
  } catch (error) {
    // runAutoBackupOnce 已把失败写进配置；此处只留调度层日志
    logger.error({ err: error }, 'auto backup attempt failed')
  } finally {
    running = false
  }
}

/** 按 config.enabled 启停调度循环；保存配置后调用（可重入）。 */
async function restartScheduler(): Promise<void> {
  stopTicker()
  const config = await getAutoBackupConfig()
  if (!config.enabled) {
    return
  }
  ticker = setInterval(() => { void tick() }, TICK_INTERVAL_MS)
}

/** 应用启动时调用（非测试环境）：配置已开启则挂起评估循环。 */
export async function setupAutoBackupScheduler(): Promise<void> {
  await restartScheduler()
}
