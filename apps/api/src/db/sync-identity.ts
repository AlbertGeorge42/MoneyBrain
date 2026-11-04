// 账本与设备的本地同步身份（F-A）。
//
// - ledgerId：账本实例的稳定 UUID，写在数据库同目录的 sync-identity.json，
//   随整库备份/回滚复制到新设备时保持一致（同一账本）。
// - deviceId：本设备的稳定 UUID，同样持久化；每台设备首次启动生成后不再变化。
//
// 文件缺失时生成并落盘；文件损坏时抛错而不是静默换新身份——后者会让同一账本
// 分裂成两个身份，比分页写失败更难排查。

import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { resolveDbDirectory } from '../common/db-path.js'
import { ValidationError } from '../common/error.js'

export interface SyncIdentity {
  ledgerId: string
  deviceId: string
}

const IDENTITY_FILENAME = 'sync-identity.json'
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

let cachedIdentity: SyncIdentity | null = null

/**
 * 读取本机同步身份；`identityPath` 仅测试使用（不写缓存）。
 */
export async function getSyncIdentity(identityPath?: string): Promise<SyncIdentity> {
  if (!identityPath && cachedIdentity) return cachedIdentity

  // 测试用固定身份文件，避免单元测试里的 mock prisma 需要实现 PRAGMA 查询
  const configuredPath = process.env.MONEYBRAIN_SYNC_IDENTITY_PATH
  const path =
    identityPath ??
    (configuredPath ? resolve(configuredPath) : join(await resolveDbDirectory(), IDENTITY_FILENAME))
  const identity = readOrCreateIdentity(path)
  if (!identityPath) cachedIdentity = identity
  return identity
}

/** 清空进程内缓存，供测试在切换身份文件后复用。 */
export function resetSyncIdentityCache(): void {
  cachedIdentity = null
}

/**
 * 容器 AAD：`formatVersion|ledgerId`。
 *
 * 绑定账本身份后，把 A/B 两个账本的容器拼错会被解密失败挡下（F-C 使用）。
 */
export function containerAad(formatVersion: number, ledgerId: string): string {
  return `${formatVersion}|${ledgerId}`
}

function readOrCreateIdentity(path: string): SyncIdentity {
  if (existsSync(path)) {
    let raw: unknown
    try {
      raw = JSON.parse(readFileSync(path, 'utf-8'))
    } catch {
      throw new ValidationError('同步身份文件损坏，无法解析')
    }
    if (!isSyncIdentity(raw)) {
      throw new ValidationError('同步身份文件损坏，缺少合法的 ledgerId / deviceId')
    }
    return { ledgerId: raw.ledgerId, deviceId: raw.deviceId }
  }

  const identity: SyncIdentity = { ledgerId: randomUUID(), deviceId: randomUUID() }
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(identity, null, 2)}\n`, 'utf-8')
  return identity
}

function isSyncIdentity(raw: unknown): raw is SyncIdentity {
  if (!raw || typeof raw !== 'object') return false
  const value = raw as Record<string, unknown>
  return (
    typeof value.ledgerId === 'string' &&
    UUID_PATTERN.test(value.ledgerId) &&
    typeof value.deviceId === 'string' &&
    UUID_PATTERN.test(value.deviceId)
  )
}
