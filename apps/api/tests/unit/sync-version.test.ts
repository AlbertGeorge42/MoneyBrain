import { describe, it, expect } from 'vitest'
import { nextSyncVersion, parseVersionVector } from '../../src/db/sync-version.js'

describe('同步版本戳（F-A）', () => {
  it('新建记录：rev = 1，vv 只含本设备维度', () => {
    expect(nextSyncVersion(null, 'device-a')).toEqual({
      rev: 1,
      vv: JSON.stringify({ 'device-a': 1 }),
    })
  })

  it('更新记录：rev + 1，并推进本设备维度，其他设备维度保留', () => {
    const previous = { rev: 3, vv: JSON.stringify({ 'device-a': 3, 'device-b': 5 }) }
    const version = nextSyncVersion(previous, 'device-a')
    expect(version.rev).toBe(4)
    expect(JSON.parse(version.vv)).toEqual({ 'device-a': 4, 'device-b': 5 })
  })

  it('vv 损坏或缺失时按空向量处理，rev 仍递增', () => {
    const version = nextSyncVersion({ rev: 2, vv: '{not-json' }, 'device-a')
    expect(version.rev).toBe(3)
    expect(JSON.parse(version.vv)).toEqual({ 'device-a': 3 })
  })

  it('parseVersionVector 忽略非法维度值', () => {
    expect(parseVersionVector('{"a":2,"b":0,"c":"x","d":-1,"e":1.5}')).toEqual({ a: 2 })
  })
})
