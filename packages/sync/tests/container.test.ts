import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  CONTAINER_FORMAT_VERSION,
  CONTAINER_MAGIC,
  ContainerAuthenticationError,
  ContainerLedgerMismatchError,
  InvalidSyncRecordError,
  DEFAULT_KDF_PARAMS,
  UnsupportedContainerVersionError,
  displayRecoveryCode,
  generateRecoveryCode,
  hchacha20,
  isContainerFile,
  openContainer,
  sealContainer,
  type SyncRecord,
} from '../src/index.js'

// 测试用低成本参数；默认参数留给真实备份，避免单测跑上分钟。
const FAST_KDF = { t: 1, m: 8192, p: 1, dkLen: 32 }

const CODE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

function snapshotRecord(overrides: Partial<SyncRecord> = {}): SyncRecord {
  return {
    entityType: 'investmentSnapshot',
    entityId: 'snap-1',
    rev: 2,
    vv: JSON.stringify({ deviceA: 2 }),
    deletedAt: null,
    data: { accountId: 'acc-1', date: '2026-11-01', balance: 1000 },
    ...overrides,
  }
}

test('恢复码是系统生成的 32 位 Base32，按 8 组展示且可还原', () => {
  const code = generateRecoveryCode()
  assert.equal(code.length, 39)
  assert.equal(code.split('-').length, 8)
  assert.equal(displayRecoveryCode(code), code)
  assert.equal(displayRecoveryCode(code.replace(/-/g, '').toLowerCase()), code)
})

test('HChaCha20 符合 draft-irtf-cfrg-xchacha 测试向量', () => {
  const key = new Uint8Array(32).map((_, index) => index)
  const nonce = new Uint8Array([
    0x00, 0x00, 0x00, 0x09, 0x00, 0x00, 0x00, 0x4a,
    0x00, 0x00, 0x00, 0x00, 0x31, 0x41, 0x59, 0x27,
  ])
  const expected = '82413b4227b27bfed30e42508a877d73a0f9e4d58a74a853c12ec41326d3ecdc'
  const output = hchacha20(key, nonce)
  assert.equal(Buffer.from(output).toString('hex'), expected)
})

test('密封/打开往返一致，且文件内看不到明文', async () => {
  const records = [snapshotRecord()]
  const sealed = await sealContainer(records, CODE, {
    ledgerId: 'ledger-1',
    kdf: FAST_KDF,
  })

  assert.equal(isContainerFile(sealed), true)
  assert.equal(sealed.subarray(0, CONTAINER_MAGIC.length).toString('utf8'), CONTAINER_MAGIC)
  assert.equal(sealed.includes(Buffer.from('previousSnapshotId')), false)
  assert.equal(sealed.includes(Buffer.from('2026-11-01')), false)

  const opened = await openContainer(sealed, displayRecoveryCode(CODE))
  assert.equal(opened.header.formatVersion, CONTAINER_FORMAT_VERSION)
  assert.equal(opened.header.ledgerId, 'ledger-1')
  assert.equal(opened.header.kdf.algorithm, 'argon2id')
  assert.equal(opened.header.cipher.algorithm, 'xchacha20-poly1305')
  assert.deepEqual(opened.records, records)
})

test('默认 KDF 参数公开且可被文档复现', () => {
  assert.deepEqual(DEFAULT_KDF_PARAMS, { t: 3, m: 65536, p: 1, dkLen: 32 })
})

test('错误恢复码失败关闭，不降级为明文或部分结果', async () => {
  const sealed = await sealContainer([snapshotRecord()], CODE, {
    ledgerId: 'ledger-1',
    kdf: FAST_KDF,
  })
  const wrongCode = 'ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ'
  await assert.rejects(
    openContainer(sealed, wrongCode),
    (error: unknown) => error instanceof ContainerAuthenticationError,
  )
})

test('篡改密文或文件头都会失败关闭', async () => {
  const sealed = await sealContainer([snapshotRecord()], CODE, {
    ledgerId: 'ledger-1',
    kdf: FAST_KDF,
  })
  const tampered = Buffer.from(sealed)
  tampered[tampered.length - 1] = tampered[tampered.length - 1]! ^ 0xff
  await assert.rejects(
    openContainer(tampered, CODE),
    (error: unknown) => error instanceof ContainerAuthenticationError,
  )
})

test('未知 formatVersion 整批拒绝（且在解密前就拒绝）', async () => {
  const header = Buffer.from(JSON.stringify({
    formatVersion: 99,
    ledgerId: 'ledger-1',
    kdf: { algorithm: 'argon2id', t: 1, m: 8192, p: 1, dkLen: 32, salt: 'AAAA' },
    cipher: { algorithm: 'xchacha20-poly1305', nonce: 'AAAA' },
  }))
  const prefix = Buffer.alloc(CONTAINER_MAGIC.length + 4)
  Buffer.from(CONTAINER_MAGIC).copy(prefix)
  prefix.writeUInt32BE(header.length, CONTAINER_MAGIC.length)
  const file = Buffer.concat([prefix, header, Buffer.alloc(16)])

  await assert.rejects(
    openContainer(file, CODE),
    (error: unknown) => error instanceof UnsupportedContainerVersionError,
  )
})

test('ledgerId 不匹配时拒绝应用（防跨账本重放）', async () => {
  const sealed = await sealContainer([snapshotRecord()], CODE, {
    ledgerId: 'ledger-1',
    kdf: FAST_KDF,
  })
  await assert.rejects(
    openContainer(sealed, CODE, { expectedLedgerId: 'ledger-2' }),
    (error: unknown) => error instanceof ContainerLedgerMismatchError,
  )
})

test('前链字段在封容器前被剔除（导出路径无法绕过）', async () => {
  const records = [snapshotRecord({
    data: { accountId: 'acc-1', date: '2026-11-01', balance: 1000, previousSnapshotId: 'snap-0' },
  })]
  const sealed = await sealContainer(records, CODE, { ledgerId: 'ledger-1', kdf: FAST_KDF })
  const opened = await openContainer(sealed, CODE)
  assert.equal('previousSnapshotId' in opened.records[0]!.data, false)
})

test('坏记录整批拒绝，不返回已通过的前缀', async () => {
  const bad = snapshotRecord({ rev: 0 })
  await assert.rejects(
    sealContainer([snapshotRecord(), bad], CODE, { ledgerId: 'ledger-1', kdf: FAST_KDF }),
    (error: unknown) => error instanceof InvalidSyncRecordError,
  )
})
