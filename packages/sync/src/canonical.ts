// 稳定序列化：同一份负载在任何键序下得到同一个字符串。
//
// 冲突判定、幂等判定与测试向量都依赖它；不能用 JSON.stringify 直接比——
// 对象键序由写入顺序决定，两台设备可能不同。

import type { JsonValue, SyncRecord } from './types.js'

export function canonicalJson(value: JsonValue): string {
  if (value === null) return 'null'
  if (typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'null'
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(',')}]`
  }

  const entries = Object.entries(value).sort(([left], [right]) =>
    left < right ? -1 : left > right ? 1 : 0,
  )
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`
}

/** 内容指纹：只含业务负载与墓碑，不含 rev/vv（后者是版本元数据）。 */
export function recordContentFingerprint(record: SyncRecord): string {
  return `${record.deletedAt ?? ''}\u0000${canonicalJson(record.data)}`
}
