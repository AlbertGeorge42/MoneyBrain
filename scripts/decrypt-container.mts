/**
 * 参考解密脚本（F-C）：按 docs/sync-container-format.md 独立解开 .mbx 容器。
 *
 * 刻意**不 import packages/sync**：如果这里能解开，说明格式文档本身足够完整，
 * 项目外的人照文档也能写出解密器。依赖只有 Node 内置 crypto 与 @noble/hashes/argon2。
 *
 * 用法：
 *   node --import tsx scripts/decrypt-container.mts <容器路径> [恢复码]
 *   npm run sync:decrypt -- <容器路径> [恢复码]
 * 恢复码也可放在 MONEYBRAIN_RECOVERY_CODE 环境变量里；输出为 header + records JSON。
 */
import { createDecipheriv } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { argon2idAsync } from '@noble/hashes/argon2'

const MAGIC = 'MBSYNC01'
const MAGIC_BYTES = Buffer.from(MAGIC, 'utf8')
const TAG_BYTES = 16
const SUPPORTED_FORMAT_VERSION = 1
const BASE32_ALPHABET = /^[A-Z2-7]+$/

interface ContainerHeader {
  formatVersion: number
  ledgerId: string
  kdf: {
    algorithm: string
    t: number
    m: number
    p: number
    dkLen: number
    salt: string
  }
  cipher: { algorithm: string; nonce: string }
}

function normalizeRecoveryCode(raw: string): string {
  const code = raw.replace(/[\s-]/g, '').toUpperCase()
  if (code.length !== 32 || !BASE32_ALPHABET.test(code)) {
    throw new Error('恢复码格式不正确：应为 32 位 Base32（A–Z2–7），可用连字符分组')
  }
  return code
}

function rotateLeft(value: number, count: number): number {
  return ((value << count) | (value >>> (32 - count))) >>> 0
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

/** HChaCha20：非 IETF 的 16 字节 nonce，产出 32 字节子密钥（见 RFC 8439 / XChaCha 草案）。 */
function hchacha20(key: Uint8Array, nonce: Uint8Array): Uint8Array {
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

function decodeBase64Url(value: string, field: string): Buffer {
  const bytes = Buffer.from(value ?? '', 'base64url')
  if (bytes.length === 0) throw new Error(`容器头 ${field} 无法解码`)
  return bytes
}

async function main(): Promise<void> {
  const filePath = process.argv[2]
  const recoveryCode =
    process.argv[3] ??
    process.env.MONEYBRAIN_RECOVERY_CODE ??
    ''

  if (!filePath) {
    throw new Error('用法：scripts/decrypt-container.mts <容器路径> [恢复码]')
  }
  if (!recoveryCode) {
    throw new Error('缺少恢复码：作为第二个参数传入，或设置 MONEYBRAIN_RECOVERY_CODE')
  }

  const file = readFileSync(resolve(filePath))
  if (file.length < MAGIC_BYTES.length + 4 + TAG_BYTES) throw new Error('不是完整的 MoneyBrain 容器')
  for (let index = 0; index < MAGIC_BYTES.length; index += 1) {
    if (file[index] !== MAGIC_BYTES[index]) throw new Error(`Magic 不匹配：期望 ${MAGIC}`)
  }

  const headerStart = MAGIC_BYTES.length + 4
  const headerLength = file.readUInt32BE(MAGIC_BYTES.length)
  if (headerLength <= 0 || headerStart + headerLength + TAG_BYTES > file.length) {
    throw new Error('容器头长度非法或文件被截断')
  }
  const header = JSON.parse(
    file.subarray(headerStart, headerStart + headerLength).toString('utf8'),
  ) as ContainerHeader

  if (header.formatVersion !== SUPPORTED_FORMAT_VERSION) {
    throw new Error(`不支持的容器格式版本：${String(header.formatVersion)}`)
  }
  if (header.kdf.algorithm !== 'argon2id' || header.cipher.algorithm !== 'xchacha20-poly1305') {
    throw new Error('不支持的 KDF / 加密算法')
  }

  const salt = decodeBase64Url(header.kdf.salt, 'salt')
  const nonce = decodeBase64Url(header.cipher.nonce, 'nonce')
  if (salt.length !== 16) throw new Error('盐长度应为 16 字节')
  if (nonce.length !== 24) throw new Error('nonce 长度应为 24 字节')

  const key = await argon2idAsync(
    new TextEncoder().encode(normalizeRecoveryCode(recoveryCode)),
    salt,
    { t: header.kdf.t, m: header.kdf.m, p: header.kdf.p, dkLen: header.kdf.dkLen },
  )

  const sealed = file.subarray(headerStart + headerLength)
  const ciphertext = sealed.subarray(0, sealed.length - TAG_BYTES)
  const tag = sealed.subarray(sealed.length - TAG_BYTES)
  const ietfNonce = new Uint8Array(12)
  ietfNonce.set(nonce.subarray(16), 4)
  const aad = Buffer.from(`${header.formatVersion}|${header.ledgerId}`, 'utf8')

  let plaintext: Buffer
  try {
    const decipher = createDecipheriv(
      'chacha20-poly1305',
      hchacha20(key, nonce.subarray(0, 16)),
      ietfNonce,
      { authTagLength: TAG_BYTES },
    )
    decipher.setAAD(aad, { plaintextLength: ciphertext.length })
    decipher.setAuthTag(tag)
    plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()])
  } catch {
    throw new Error('恢复码不正确，或容器文件已损坏')
  }

  const payload = JSON.parse(plaintext.toString('utf8')) as { records?: unknown }
  console.log(JSON.stringify({ header, records: payload.records }, null, 2))
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
