import { describe, it, expect } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import {
  getSyncIdentity,
  resetSyncIdentityCache,
  containerAad,
} from '../../src/db/sync-identity.js'

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const makeIdentityPath = (): { path: string; cleanup: () => void } => {
  const dir = mkdtempSync(join(tmpdir(), 'mb-sync-identity-'))
  return {
    path: join(dir, 'sync-identity.json'),
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  }
}

describe('账本 / 设备身份（F-A）', () => {
  it('首次读取生成并持久化两个稳定 UUID', async () => {
    const { path, cleanup } = makeIdentityPath()
    try {
      const first = await getSyncIdentity(path)
      expect(first.ledgerId).toMatch(UUID_PATTERN)
      expect(first.deviceId).toMatch(UUID_PATTERN)

      const persisted = JSON.parse(readFileSync(path, 'utf-8'))
      expect(persisted).toEqual(first)

      const second = await getSyncIdentity(path)
      expect(second).toEqual(first)
    } finally {
      cleanup()
    }
  })

  it('两台设备（两个身份文件）各有不同的 deviceId，但 ledgerId 可按导入复制', async () => {
    const deviceA = makeIdentityPath()
    const deviceB = makeIdentityPath()
    try {
      const a = await getSyncIdentity(deviceA.path)
      const b = await getSyncIdentity(deviceB.path)
      expect(a.deviceId).not.toBe(b.deviceId)

      // 新设备导入同一账本：复制 ledgerId、保留本机 deviceId
      writeFileSync(
        deviceB.path,
        JSON.stringify({ ledgerId: a.ledgerId, deviceId: b.deviceId }),
        'utf-8',
      )
      const imported = await getSyncIdentity(deviceB.path)
      expect(imported.ledgerId).toBe(a.ledgerId)
      expect(imported.deviceId).toBe(b.deviceId)
    } finally {
      deviceA.cleanup()
      deviceB.cleanup()
    }
  })

  it('损坏的身份文件抛错而不是静默换新身份', async () => {
    const { path, cleanup } = makeIdentityPath()
    try {
      writeFileSync(path, JSON.stringify({ ledgerId: randomUUID() }), 'utf-8')
      await expect(getSyncIdentity(path)).rejects.toThrow(/同步身份文件损坏/)
    } finally {
      cleanup()
    }
  })

  it('容器 AAD 绑定 formatVersion 与 ledgerId', async () => {
    const { path, cleanup } = makeIdentityPath()
    try {
      const { ledgerId } = await getSyncIdentity(path)
      expect(containerAad(1, ledgerId)).toBe(`1|${ledgerId}`)
    } finally {
      cleanup()
    }
  })

  it('默认路径的身份在进程内缓存，重复读取结果一致', async () => {
    resetSyncIdentityCache()
    const first = await getSyncIdentity()
    const second = await getSyncIdentity()
    expect(second).toEqual(first)
  })
})
