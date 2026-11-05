// 备份与同步共用的加密容器（F-C）。
//
// - 系统生成恢复码，落在数据库同目录的 sync-recovery-code.json（本地明文，威胁模型明确）
// - 完整备份 = 一个 `backupArchive` 记录（ZIP 字节装在 data 里），走和同步相同的 seal/open
// - 导入时按文件魔数识别：容器先解密成 ZIP，再交给原有导入流程；老明文 ZIP 继续可用
// - 换设备恢复时可由调用方传入恢复码；同机导入默认读本地恢复码文件

import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import {
  ContainerError,
  generateRecoveryCode,
  isContainerFile,
  normalizeRecoveryCode,
  openContainer,
  sealContainer,
  type Argon2idParams,
  type SyncRecord,
} from '../../../../../packages/sync/src/index.js'
import { resolveDbDirectory } from '../../common/db-path.js'
import { ValidationError } from '../../common/error.js'
import { getSyncIdentity } from '../../db/sync-identity.js'

/** 容器里承载完整备份的实体类型；同步合并把它当未知类型跳过，不参与账本合并。 */
export const BACKUP_ARCHIVE_ENTITY_TYPE = 'backupArchive'
export const BACKUP_CONTAINER_EXTENSION = 'mbx'

const RECOVERY_CODE_FILENAME = 'sync-recovery-code.json'

interface RecoveryCodeFile {
  recoveryCode: string
  createdAt: string
}

export interface EncryptedBackupOptions {
  /** 换设备恢复时传入用户手里的恢复码；同机导出/导入可省略。 */
  recoveryCode?: string
  /** 仅测试使用：降低 Argon2id 成本，避免单测每次都跑 64 MiB。 */
  kdf?: Partial<Argon2idParams>
}

export function isEncryptedBackup(buffer: Uint8Array): boolean {
  return isContainerFile(buffer)
}

function configuredRecoveryCodePath(): string | null {
  const configured = process.env.MONEYBRAIN_RECOVERY_CODE_PATH
  return configured ? resolve(configured) : null
}

async function recoveryCodePath(): Promise<string> {
  return configuredRecoveryCodePath() ?? join(await resolveDbDirectory(), RECOVERY_CODE_FILENAME)
}

function readRecoveryCodeFile(path: string): string {
  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(path, 'utf-8'))
  } catch {
    throw new ValidationError('本机恢复码文件损坏，无法解析')
  }
  const candidate = (raw as Partial<RecoveryCodeFile> | null)?.recoveryCode
  if (typeof candidate !== 'string') throw new ValidationError('本机恢复码文件损坏，缺少 recoveryCode')
  wrapContainerError(() => normalizeRecoveryCode(candidate))
  return candidate
}

/** 同机读取恢复码；还没生成过返回 null（调用方决定是否创建）。 */
export async function readLocalRecoveryCode(): Promise<string | null> {
  const path = await recoveryCodePath()
  return existsSync(path) ? readRecoveryCodeFile(path) : null
}

/** 首次使用时系统生成恢复码并落盘；用户抄写保管，不支持自选口令。 */
export async function getOrCreateRecoveryCode(): Promise<string> {
  const existing = await readLocalRecoveryCode()
  if (existing) return existing

  const path = await recoveryCodePath()
  const code = generateRecoveryCode()
  mkdirSync(dirname(path), { recursive: true })
  const payload: RecoveryCodeFile = { recoveryCode: code, createdAt: new Date().toISOString() }
  writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`, { encoding: 'utf-8', mode: 0o600 })
  return code
}

function wrapContainerError<T>(run: () => T): T {
  try {
    return run()
  } catch (error) {
    if (error instanceof ContainerError) throw new ValidationError(error.message)
    throw error
  }
}

async function resolveRecoveryCode(options: EncryptedBackupOptions = {}): Promise<string> {
  if (options.recoveryCode) {
    return wrapContainerError(() => normalizeRecoveryCode(options.recoveryCode!))
  }
  const local = await readLocalRecoveryCode()
  if (!local) {
    throw new ValidationError('本机还没有恢复码，无法解密这个容器；换设备恢复请输入备份时抄写的恢复码')
  }
  return local
}

/** 把完整备份 ZIP 封成加密容器；记录流里只有一条 backupArchive。 */
export async function sealBackupArchive(
  archive: Buffer,
  options: EncryptedBackupOptions = {},
): Promise<Buffer> {
  const identity = await getSyncIdentity()
  const recoveryCode = options.recoveryCode
    ? wrapContainerError(() => normalizeRecoveryCode(options.recoveryCode!))
    : await getOrCreateRecoveryCode()

  const record: SyncRecord = {
    entityType: BACKUP_ARCHIVE_ENTITY_TYPE,
    entityId: randomUUID(),
    rev: 1,
    vv: JSON.stringify({ [identity.deviceId]: 1 }),
    deletedAt: null,
    data: {
      archiveBase64: archive.toString('base64'),
      format: 'zip',
      exportedAt: new Date().toISOString(),
    },
  }

  return wrapContainerErrorAsync(() =>
    sealContainer([record], recoveryCode, { ledgerId: identity.ledgerId, kdf: options.kdf }),
  )
}

/** 打开完整备份容器，返回里面的 ZIP 字节。 */
export async function openBackupArchive(
  buffer: Uint8Array,
  options: EncryptedBackupOptions = {},
): Promise<Buffer> {
  const recoveryCode = await resolveRecoveryCode(options)
  const opened = await wrapContainerErrorAsync(() => openContainer(buffer, recoveryCode))

  const record = opened.records.find(
    (candidate) => candidate.entityType === BACKUP_ARCHIVE_ENTITY_TYPE && candidate.deletedAt === null,
  )
  if (!record) throw new ValidationError('加密容器里没有备份数据')

  const encoded = record.data.archiveBase64
  if (typeof encoded !== 'string' || encoded.length === 0) {
    throw new ValidationError('备份容器损坏：缺少 archiveBase64')
  }
  const archive = Buffer.from(encoded, 'base64')
  if (archive.length === 0) throw new ValidationError('备份容器损坏：备份内容为空')
  return archive
}

async function wrapContainerErrorAsync<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } catch (error) {
    if (error instanceof ContainerError) throw new ValidationError(error.message)
    throw error
  }
}

export interface NormalizedBackupInput {
  buffer: Buffer
  filename: string
  encrypted: boolean
}

/**
 * 导入前置归一化：容器先解密成 ZIP；明文 ZIP/CSV/JSON 原样返回。
 * 文件名只用来选后续解析器，因此容器统一换成 .zip。
 */
export async function normalizeBackupInput(
  buffer: Buffer,
  filename: string,
  options: EncryptedBackupOptions = {},
): Promise<NormalizedBackupInput> {
  if (!isEncryptedBackup(buffer)) return { buffer, filename, encrypted: false }

  const archive = await openBackupArchive(buffer, options)
  const zipFilename = filename.toLowerCase().endsWith(`.${BACKUP_CONTAINER_EXTENSION}`)
    ? filename.slice(0, -(BACKUP_CONTAINER_EXTENSION.length + 1)) + '.zip'
    : filename.toLowerCase().endsWith('.zip')
      ? filename
      : `${filename}.zip`
  return { buffer: archive, filename: zipFilename, encrypted: true }
}
