import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'

import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openContainer } from '../../../../../packages/sync/src/index.js'
import {
  BACKUP_ARCHIVE_ENTITY_TYPE,
  getOrCreateRecoveryCode,
  isEncryptedBackup,
  normalizeBackupInput,
  openBackupArchive,
  readLocalRecoveryCode,
  sealBackupArchive,
} from '../../../src/services/sync/container.service.js'
import { ValidationError } from '../../../src/common/error.js'

const FAST_KDF = { t: 1, m: 8192, p: 1, dkLen: 32 }
const ORIGINAL_IDENTITY_PATH = process.env.MONEYBRAIN_SYNC_IDENTITY_PATH
const ORIGINAL_RECOVERY_PATH = process.env.MONEYBRAIN_RECOVERY_CODE_PATH

let tempDir: string

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'mb-container-'))
  process.env.MONEYBRAIN_SYNC_IDENTITY_PATH = join(tempDir, 'sync-identity.json')
  process.env.MONEYBRAIN_RECOVERY_CODE_PATH = join(tempDir, 'sync-recovery-code.json')
})

afterEach(() => {
  restoreEnv('MONEYBRAIN_SYNC_IDENTITY_PATH', ORIGINAL_IDENTITY_PATH)
  restoreEnv('MONEYBRAIN_RECOVERY_CODE_PATH', ORIGINAL_RECOVERY_PATH)
  rmSync(tempDir, { recursive: true, force: true })
})

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key]
  else process.env[key] = value
}

describe('备份容器（F-C）', () => {
  it('首次使用生成恢复码并落盘，第二次读取一致', async () => {
    assert.equal(await readLocalRecoveryCode(), null)

    const codePath = process.env.MONEYBRAIN_RECOVERY_CODE_PATH!
    const first = await getOrCreateRecoveryCode()
    expect(first).toMatch(/^[A-Z2-7]{4}(-[A-Z2-7]{4}){7}$/)

    const second = await getOrCreateRecoveryCode()
    expect(second).toBe(first)
    expect(await readLocalRecoveryCode()).toBe(first)

    const file = JSON.parse(readFileSync(codePath, 'utf-8'))
    expect(file.recoveryCode).toBe(first)
  })

  it('备份封装/打开往返一致，文件内看不到明文', async () => {
    const archive = Buffer.from('PK\u0003\u0004 CSV-SECRET-PAYLOAD', 'utf-8')
    const container = await sealBackupArchive(archive, { kdf: FAST_KDF })

    expect(isEncryptedBackup(container)).toBe(true)
    expect(container.includes(Buffer.from('CSV-SECRET-PAYLOAD'))).toBe(false)

    const restored = await openBackupArchive(container)
    expect(restored.equals(archive)).toBe(true)
  })

  it('备份文件可被同步引擎读取：里面是一条 backupArchive 记录', async () => {
    const archive = Buffer.from('PK\u0003\u0004', 'utf-8')
    const container = await sealBackupArchive(archive, { kdf: FAST_KDF })
    const opened = await openContainer(container, await getOrCreateRecoveryCode())

    expect(opened.records).toHaveLength(1)
    expect(opened.records[0]!.entityType).toBe(BACKUP_ARCHIVE_ENTITY_TYPE)
    expect(opened.records[0]!.data.archiveBase64).toBe(archive.toString('base64'))
  })

  it('错误恢复码失败关闭；换设备时可用显式恢复码打开', async () => {
    const archive = Buffer.from('PK\u0003\u0004', 'utf-8')
    const container = await sealBackupArchive(archive, { kdf: FAST_KDF })
    const originalCode = await getOrCreateRecoveryCode()

    await expect(
      openBackupArchive(container, { recoveryCode: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZ' }),
    ).rejects.toThrow(ValidationError)

    // 模拟新设备：本机没有恢复码文件，靠用户抄写的恢复码打开
    process.env.MONEYBRAIN_RECOVERY_CODE_PATH = join(tempDir, 'new-device-recovery-code.json')
    const recovered = await openBackupArchive(container, { recoveryCode: originalCode })
    expect(recovered.equals(archive)).toBe(true)
  })

  it('归一化输入：容器解密成 ZIP，普通 ZIP 原样返回', async () => {
    const archive = Buffer.from('PK\u0003\u0004', 'utf-8')
    const container = await sealBackupArchive(archive, { kdf: FAST_KDF })

    const encrypted = await normalizeBackupInput(container, 'moneybrain-backup-2026-11-05.mbx')
    expect(encrypted.encrypted).toBe(true)
    expect(encrypted.filename).toBe('moneybrain-backup-2026-11-05.zip')
    expect(encrypted.buffer.equals(archive)).toBe(true)

    const plain = await normalizeBackupInput(archive, 'legacy-backup.zip')
    expect(plain.encrypted).toBe(false)
    expect(plain.buffer).toBe(archive)
  })
})
