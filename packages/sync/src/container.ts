// 加密容器（F-C）。
//
// 全项目只有这一种离开设备的字节格式：header(formatVersion, ledgerId, kdf, salt, nonce)
// + ciphertext + tag。整包一个 AEAD（XChaCha20-Poly1305），坏记录/截断/篡改一律整批拒绝。
//
// 加密库锁定：Argon2id 用 @noble/hashes（纯 JS，跨端一致），AEAD 用 Node 内置 crypto
// 的 chacha20-poly1305 + 本文件的 HChaCha20 子密钥派生（RFC 8439 / draft-irtf-cfrg-xchacha）。
// 移动端替换 AEAD 实现必须保持同一字节格式，见 docs/sync-container-format.md。
//
// 容器格式在 V5/V3 跨端与初始化开销验证前视为**暂定**（formatVersion 仍为 1）。

import { argon2idAsync } from '@noble/hashes/argon2'
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { assertNoLocalOnlyFields, stripLocalOnlyRecordFields } from './local-fields.js'
import { validateSyncRecords } from './records.js'
import type { SyncRecord } from './types.js'

export const CONTAINER_FORMAT_VERSION = 1
/** 文件头魔数；扩展名 .mbx。 */
export const CONTAINER_MAGIC = 'MBSYNC01'
export const CONTAINER_MAGIC_BYTES = Buffer.from(CONTAINER_MAGIC, 'utf8')
export const RECOVERY_CODE_GROUP_SIZE = 4

export interface Argon2idParams {
  /** 迭代次数。 */
  t: number
  /** 内存成本，单位 KiB。 */
  m: number
  /** 并行度。 */
  p: number
  /** 派生密钥长度（字节）。 */
  dkLen: number
}

/** 默认成本：64 MiB / 3 轮；V5 真机测初始化开销后再冻结。 */
export const DEFAULT_KDF_PARAMS: Argon2idParams = { t: 3, m: 65536, p: 1, dkLen: 32 }

const SALT_BYTES = 16
const NONCE_BYTES = 24
const TAG_BYTES = 16
const AUTH_TAG_BYTES = 16

export interface ContainerHeader {
  formatVersion: number
  ledgerId: string
  kdf: Argon2idParams & { algorithm: 'argon2id'; salt: string }
  cipher: { algorithm: 'xchacha20-poly1305'; nonce: string }
}

export interface OpenedContainer {
  header: ContainerHeader
  records: SyncRecord[]
}

export class ContainerError extends Error {
  readonly code: string

  constructor(message: string, code: string) {
    super(message)
    this.name = 'ContainerError'
    this.code = code
  }
}

export class UnsupportedContainerVersionError extends ContainerError {
  constructor(version: unknown) {
    super(`不支持的容器格式版本：${String(version)}`, 'UNSUPPORTED_CONTAINER_VERSION')
    this.name = 'UnsupportedContainerVersionError'
  }
}

/** 恢复码错误 / 文件损坏 / 被截断都用同一个失败出口，不泄露任何明文信息。 */
export class ContainerAuthenticationError extends ContainerError {
  constructor() {
    super('恢复码不正确，或容器文件已损坏', 'CONTAINER_AUTHENTICATION_FAILED')
    this.name = 'ContainerAuthenticationError'
  }
}

export class ContainerLedgerMismatchError extends ContainerError {
  constructor() {
    super('容器属于另一个账本，拒绝应用', 'CONTAINER_LEDGER_MISMATCH')
    this.name = 'ContainerLedgerMismatchError'
  }
}

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

function base32Encode(bytes: Uint8Array): string {
  let output = ''
  let value = 0
  let bits = 0
  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
    value &= (1 << bits) - 1
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31]
  return output
}

/** 系统生成恢复码：160 位熵，Base32 编码后按 4 位分组显示。用户抄写保管，不自选口令。 */
export function generateRecoveryCode(): string {
  return displayRecoveryCode(base32Encode(randomBytes(20)))
}

/** 去掉分隔符、统一大写；格式不合法直接拒绝（不做模糊容错）。 */
export function normalizeRecoveryCode(raw: string): string {
  const code = raw.replace(/[\s-]/g, '').toUpperCase()
  if (code.length !== 32 || !/^[A-Z2-7]+$/.test(code)) {
    throw new ContainerError('恢复码格式不正确', 'INVALID_RECOVERY_CODE')
  }
  return code
}

export function displayRecoveryCode(code: string): string {
  const normalized = code.replace(/[\s-]/g, '').toUpperCase()
  const groups: string[] = []
  for (let index = 0; index < normalized.length; index += RECOVERY_CODE_GROUP_SIZE) {
    groups.push(normalized.slice(index, index + RECOVERY_CODE_GROUP_SIZE))
  }
  return groups.join('-')
}

/** 恢复码的展示分组要求：8 组 × 4 位。 */
export function isValidDisplayRecoveryCode(code: string): boolean {
  return displayRecoveryCode(code) === code && normalizeRecoveryCode(code).length === 32
}

function encodeBase64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64url')
}

function decodeBase64Url(value: unknown, field: string): Buffer {
  if (typeof value !== 'string' || value.length === 0) {
    throw new ContainerError(`容器头 ${field} 缺失`, 'INVALID_CONTAINER_HEADER')
  }
  const bytes = Buffer.from(value, 'base64url')
  if (bytes.length === 0) throw new ContainerError(`容器头 ${field} 无法解码`, 'INVALID_CONTAINER_HEADER')
  return bytes
}

function readUint32LE(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset]! |
    (bytes[offset + 1]! << 8) |
    (bytes[offset + 2]! << 16) |
    (bytes[offset + 3]! << 24)
  ) >>> 0
}

function writeUint32LE(target: Uint8Array, offset: number, value: number): void {
  target[offset] = value & 0xff
  target[offset + 1] = (value >>> 8) & 0xff
  target[offset + 2] = (value >>> 16) & 0xff
  target[offset + 3] = (value >>> 24) & 0xff
}

function rotateLeft(value: number, count: number): number {
  return ((value << count) | (value >>> (32 - count))) >>> 0
}

function quarterRound(state: Uint32Array, a: number, b: number, c: number, d: number): void {
  state[a] = (state[a]! + state[b]!) >>> 0
  state[d] = rotateLeft(state[d]! ^ state[a]!, 16)
  state[c] = (state[c]! + state[d]!) >>> 0
  state[b] = rotateLeft(state[b]! ^ state[c]!, 12)
  state[a] = (state[a]! + state[b]!) >>> 0
  state[d] = rotateLeft(state[d]! ^ state[a]!, 8)
  state[c] = (state[c]! + state[d]!) >>> 0
  state[b] = rotateLeft(state[b]! ^ state[c]!, 7)
}

/** HChaCha20：把 24 字节 XChaCha nonce 的前 16 字节折进密钥，产出 IETF ChaCha20 的子密钥。 */
export function hchacha20(key: Uint8Array, nonce: Uint8Array): Uint8Array {
  if (key.length !== 32) throw new ContainerError('HChaCha20 密钥必须是 32 字节', 'INVALID_KEY')
  if (nonce.length !== 16) throw new ContainerError('HChaCha20 nonce 必须是 16 字节', 'INVALID_NONCE')

  const state = new Uint32Array(16)
  state[0] = 0x61707865
  state[1] = 0x3320646e
  state[2] = 0x79622d32
  state[3] = 0x6b206574
  for (let index = 0; index < 8; index += 1) {
    state[4 + index] = readUint32LE(key, index * 4)
  }
  for (let index = 0; index < 4; index += 1) {
    state[12 + index] = readUint32LE(nonce, index * 4)
  }

  for (let round = 0; round < 10; round += 1) {
    quarterRound(state, 0, 4, 8, 12)
    quarterRound(state, 1, 5, 9, 13)
    quarterRound(state, 2, 6, 10, 14)
    quarterRound(state, 3, 7, 11, 15)
    quarterRound(state, 0, 5, 10, 15)
    quarterRound(state, 1, 6, 11, 12)
    quarterRound(state, 2, 7, 8, 13)
    quarterRound(state, 3, 4, 9, 14)
  }

  const output = new Uint8Array(32)
  for (let index = 0; index < 4; index += 1) {
    writeUint32LE(output, index * 4, state[index]!)
    writeUint32LE(output, 16 + index * 4, state[12 + index]!)
  }
  return output
}

function ietfNonceFromXNonce(nonce: Uint8Array): Uint8Array {
  const ietfNonce = new Uint8Array(12)
  ietfNonce.set(nonce.subarray(16), 4)
  return ietfNonce
}

function aeadSeal(
  key: Uint8Array,
  nonce: Uint8Array,
  aad: Uint8Array,
  plaintext: Uint8Array,
): Buffer {
  const subkey = hchacha20(key, nonce.subarray(0, 16))
  const cipher = createCipheriv('chacha20-poly1305', subkey, ietfNonceFromXNonce(nonce), {
    authTagLength: TAG_BYTES,
  })
  cipher.setAAD(aad, { plaintextLength: plaintext.length })
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()])
  return Buffer.concat([ciphertext, cipher.getAuthTag()])
}

function aeadOpen(
  key: Uint8Array,
  nonce: Uint8Array,
  aad: Uint8Array,
  sealed: Uint8Array,
): Buffer {
  if (sealed.length < AUTH_TAG_BYTES) throw new ContainerAuthenticationError()
  const ciphertext = sealed.subarray(0, sealed.length - AUTH_TAG_BYTES)
  const tag = sealed.subarray(sealed.length - AUTH_TAG_BYTES)
  try {
    const decipher = createDecipheriv('chacha20-poly1305', hchacha20(key, nonce.subarray(0, 16)), ietfNonceFromXNonce(nonce), {
      authTagLength: TAG_BYTES,
    })
    decipher.setAAD(aad, { plaintextLength: ciphertext.length })
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(ciphertext), decipher.final()])
  } catch {
    throw new ContainerAuthenticationError()
  }
}

function containerAad(formatVersion: number, ledgerId: string): Buffer {
  return Buffer.from(`${formatVersion}|${ledgerId}`, 'utf8')
}

function assertKdfParams(params: Argon2idParams): void {
  if (
    !Number.isInteger(params.t) || params.t < 1 || params.t > 10 ||
    !Number.isInteger(params.m) || params.m < 8 || params.m > 1_048_576 ||
    !Number.isInteger(params.p) || params.p < 1 || params.p > 8 ||
    params.dkLen !== 32
  ) {
    throw new ContainerError('Argon2id 参数超出合理范围', 'INVALID_KDF_PARAMS')
  }
}

async function deriveKey(
  recoveryCode: string,
  salt: Uint8Array,
  params: Argon2idParams,
): Promise<Uint8Array> {
  return argon2idAsync(
    new TextEncoder().encode(normalizeRecoveryCode(recoveryCode)),
    salt,
    { t: params.t, m: params.m, p: params.p, dkLen: params.dkLen },
  )
}

export interface SealContainerOptions {
  ledgerId: string
  kdf?: Partial<Argon2idParams>
}

/** 把记录集封成加密容器。封之前统一剔除本地字段，导出路径无法绕过。 */
export async function sealContainer(
  records: readonly SyncRecord[],
  recoveryCode: string,
  options: SealContainerOptions,
): Promise<Buffer> {
  if (!options.ledgerId) throw new ContainerError('缺少 ledgerId', 'MISSING_LEDGER_ID')

  const prepared = stripLocalOnlyRecordFields(validateSyncRecords(records))
  assertNoLocalOnlyFields(prepared)

  const params: Argon2idParams = { ...DEFAULT_KDF_PARAMS, ...options.kdf }
  assertKdfParams(params)

  const salt = randomBytes(SALT_BYTES)
  const nonce = randomBytes(NONCE_BYTES)
  const key = await deriveKey(recoveryCode, salt, params)

  const header: ContainerHeader = {
    formatVersion: CONTAINER_FORMAT_VERSION,
    ledgerId: options.ledgerId,
    kdf: { algorithm: 'argon2id', ...params, salt: encodeBase64Url(salt) },
    cipher: { algorithm: 'xchacha20-poly1305', nonce: encodeBase64Url(nonce) },
  }
  const headerBytes = Buffer.from(JSON.stringify(header), 'utf8')
  const plaintext = Buffer.from(JSON.stringify({ records: prepared }), 'utf8')
  const sealed = aeadSeal(key, nonce, containerAad(header.formatVersion, header.ledgerId), plaintext)

  const prefix = Buffer.alloc(CONTAINER_MAGIC_BYTES.length + 4)
  CONTAINER_MAGIC_BYTES.copy(prefix, 0)
  prefix.writeUInt32BE(headerBytes.length, CONTAINER_MAGIC_BYTES.length)
  return Buffer.concat([prefix, headerBytes, sealed])
}

export function isContainerFile(bytes: Uint8Array): boolean {
  if (bytes.length < CONTAINER_MAGIC_BYTES.length) return false
  for (let index = 0; index < CONTAINER_MAGIC_BYTES.length; index += 1) {
    if (bytes[index] !== CONTAINER_MAGIC_BYTES[index]) return false
  }
  return true
}

export interface OpenContainerOptions {
  /** 同步应用必须校验；备份恢复（换设备）不校验。 */
  expectedLedgerId?: string
}

function parseHeader(raw: unknown): ContainerHeader {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new ContainerError('容器头不是对象', 'INVALID_CONTAINER_HEADER')
  }
  const header = raw as Partial<ContainerHeader>
  if (header.formatVersion !== CONTAINER_FORMAT_VERSION) {
    throw new UnsupportedContainerVersionError(header.formatVersion)
  }
  if (typeof header.ledgerId !== 'string' || header.ledgerId.length === 0) {
    throw new ContainerError('容器头 ledgerId 缺失', 'INVALID_CONTAINER_HEADER')
  }
  const kdf = header.kdf
  if (
    !kdf || kdf.algorithm !== 'argon2id' ||
    typeof kdf.t !== 'number' || typeof kdf.m !== 'number' ||
    typeof kdf.p !== 'number' || typeof kdf.dkLen !== 'number'
  ) {
    throw new ContainerError('容器头 KDF 参数缺失', 'INVALID_CONTAINER_HEADER')
  }
  assertKdfParams({ t: kdf.t, m: kdf.m, p: kdf.p, dkLen: kdf.dkLen })
  const cipher = header.cipher
  if (!cipher || cipher.algorithm !== 'xchacha20-poly1305') {
    throw new ContainerError('容器头加密算法不支持', 'INVALID_CONTAINER_HEADER')
  }
  return header as ContainerHeader
}

/**
 * 入站记录归一：先校验，再剔除本地字段。
 *
 * `sealContainer` 在出站已经剔除过一次，这里做入站对称防御——旧容器或第三方实现
 * 仍可能带 `previousSnapshotId`，应用端必须忽略别台设备的重排结果（F-C）。
 * 未来逐记录同步的合并入口也复用它，保证所有入站路径同一套边界。
 */
export function normalizeInboundRecords(raw: unknown): SyncRecord[] {
  return stripLocalOnlyRecordFields(validateSyncRecords(raw))
}

/** 打开容器：未知版本整批拒绝，坏记录整批拒绝，绝不返回半份记录。 */
export async function openContainer(
  bytes: Uint8Array,
  recoveryCode: string,
  options: OpenContainerOptions = {},
): Promise<OpenedContainer> {
  const file = Buffer.from(bytes)
  if (!isContainerFile(file)) throw new ContainerError('不是 MoneyBrain 加密容器', 'NOT_A_CONTAINER')

  const headerStart = CONTAINER_MAGIC_BYTES.length + 4
  if (file.length < headerStart + TAG_BYTES) {
    throw new ContainerError('容器文件被截断', 'TRUNCATED_CONTAINER')
  }
  const headerLength = file.readUInt32BE(CONTAINER_MAGIC_BYTES.length)
  if (headerLength <= 0 || headerStart + headerLength + TAG_BYTES > file.length) {
    throw new ContainerError('容器头长度非法', 'INVALID_CONTAINER_HEADER')
  }

  let rawHeader: unknown
  try {
    rawHeader = JSON.parse(file.subarray(headerStart, headerStart + headerLength).toString('utf8'))
  } catch {
    throw new ContainerError('容器头不是合法 JSON', 'INVALID_CONTAINER_HEADER')
  }
  const header = parseHeader(rawHeader)

  if (options.expectedLedgerId && options.expectedLedgerId !== header.ledgerId) {
    throw new ContainerLedgerMismatchError()
  }

  const salt = decodeBase64Url(header.kdf.salt, 'salt')
  const nonce = decodeBase64Url(header.cipher.nonce, 'nonce')
  if (salt.length !== SALT_BYTES) throw new ContainerError('容器头 salt 长度非法', 'INVALID_CONTAINER_HEADER')
  if (nonce.length !== NONCE_BYTES) throw new ContainerError('容器头 nonce 长度非法', 'INVALID_CONTAINER_HEADER')

  const key = await deriveKey(recoveryCode, salt, {
    t: header.kdf.t,
    m: header.kdf.m,
    p: header.kdf.p,
    dkLen: header.kdf.dkLen,
  })
  const plaintext = aeadOpen(
    key,
    nonce,
    containerAad(header.formatVersion, header.ledgerId),
    file.subarray(headerStart + headerLength),
  )

  let payload: unknown
  try {
    payload = JSON.parse(plaintext.toString('utf8'))
  } catch {
    throw new ContainerError('容器负载不是合法 JSON', 'INVALID_CONTAINER_PAYLOAD')
  }
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    throw new ContainerError('容器负载必须是对象', 'INVALID_CONTAINER_PAYLOAD')
  }

  return {
    header,
    records: normalizeInboundRecords((payload as { records?: unknown }).records),
  }
}
