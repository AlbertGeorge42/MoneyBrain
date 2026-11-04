// 同步版本戳（F-A）：每条可同步记录带 rev 与 vv。
//
// - rev：本设备对这条记录的本地修订号，每次写入 +1。
// - vv：版本向量 {deviceId: maxRev}，每次写入把本设备维度推进到新 rev，
//   其他设备的已知维度原样保留，留给后续合并算法（F-B）。

import { getSyncIdentity } from './sync-identity.js'

export interface SyncVersion {
  rev: number
  vv: string
}

export interface SyncVersionSource {
  rev: number
  vv: string | null
}

/** 计算下一次写入的版本戳；previous 为 null 表示新建。 */
export function nextSyncVersion(
  previous: SyncVersionSource | null,
  deviceId: string,
): SyncVersion {
  const rev = (previous?.rev ?? 0) + 1
  const vv = parseVersionVector(previous?.vv)
  vv[deviceId] = rev
  return { rev, vv: JSON.stringify(vv) }
}

/** 宽容解析 vv：损坏或非对象时按空向量处理（rev 仍是权威值）。 */
export function parseVersionVector(raw: string | null | undefined): Record<string, number> {
  if (!raw) return {}
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return {}
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
  const vv: Record<string, number> = {}
  for (const [deviceId, value] of Object.entries(parsed)) {
    if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
      vv[deviceId] = value
    }
  }
  return vv
}

/** 新建记录时使用：rev = 1。 */
export async function createSyncVersion(): Promise<SyncVersion> {
  const { deviceId } = await getSyncIdentity()
  return nextSyncVersion(null, deviceId)
}

/** 更新已有记录时使用：rev + 1，并推进本设备 vv 维度。 */
export async function updateSyncVersion(previous: SyncVersionSource): Promise<SyncVersion> {
  const { deviceId } = await getSyncIdentity()
  return nextSyncVersion(previous, deviceId)
}
