// 版本向量：判定两条记录谁是谁的后继（决策 #24 / #25）。
//
// 不用时间戳：设备时钟可能偏差几小时，用它排序会静默覆盖用户较晚的修改。

export type VersionRelation = 'equal' | 'dominates' | 'dominated' | 'concurrent'

export type VersionVector = Record<string, number>

/** 宽容解析：缺失、损坏或非法维度按 0 处理（与 F-A 的 `parseVersionVector` 同口径）。 */
export function parseVersionVector(raw: string | null | undefined): VersionVector {
  if (!raw) return {}
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return {}
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
  const vector: VersionVector = {}
  for (const [deviceId, value] of Object.entries(parsed)) {
    if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
      vector[deviceId] = value
    }
  }
  return vector
}

export function encodeVersionVector(vector: VersionVector): string {
  const sorted: VersionVector = {}
  for (const deviceId of Object.keys(vector).sort()) {
    const value = vector[deviceId]
    if (value !== undefined && value > 0) sorted[deviceId] = value
  }
  return JSON.stringify(sorted)
}

/**
 * 以 left 为主体比较两个向量：
 * - `dominates`：left 在每一维都 ≥ right（left 是 right 的后继）
 * - `dominated`：right 在每一维都 ≥ left
 * - `equal`：每一维相等
 * - `concurrent`：各有对方没有的修订（真并发）
 */
export function compareVersionVectors(
  left: VersionVector,
  right: VersionVector,
): VersionRelation {
  let leftAhead = false
  let rightAhead = false
  for (const deviceId of new Set([...Object.keys(left), ...Object.keys(right)])) {
    const leftValue = left[deviceId] ?? 0
    const rightValue = right[deviceId] ?? 0
    if (leftValue > rightValue) leftAhead = true
    if (rightValue > leftValue) rightAhead = true
  }
  if (leftAhead && rightAhead) return 'concurrent'
  if (leftAhead) return 'dominates'
  if (rightAhead) return 'dominated'
  return 'equal'
}

/** 逐维取最大：冲突收敛时构造新记录使用。 */
export function maxVersionVectors(left: VersionVector, right: VersionVector): VersionVector {
  const merged: VersionVector = { ...left }
  for (const [deviceId, value] of Object.entries(right)) {
    merged[deviceId] = Math.max(merged[deviceId] ?? 0, value)
  }
  return merged
}
