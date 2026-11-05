/**
 * V5 spike：两实例只通过共享目录交换加密容器，验证能否收敛。
 *
 * 这是**验证脚本，不属于产品路径**（结论写在 docs/blueprint/stage-4-expansion.md）；
 * 目录同步的真实实现（网盘适配器、原子改名、设备调度）要等 V5 结论冻结后再做。
 *
 * 覆盖：
 * 1. 两个 `deviceId` 写各自的 `<device>.mbx`（临时文件 + 原子 rename），多轮后记录集一致；
 * 2. 乱序读取、重复读取同一文件（幂等）；
 * 3. 截断的「半文件」与非容器文件被拒绝，不崩溃、不污染状态；
 * 4. 用默认 Argon2id 参数实测 seal/open 耗时，对照验收线 2s。
 *
 * 用法：`npm run spike:v5`（临时目录用后即删；`--keep` 保留以便排查）。
 */
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { performance } from 'node:perf_hooks'

import {
  DEFAULT_KDF_PARAMS,
  encodeVersionVector,
  mergeRecords,
  openContainer,
  parseVersionVector,
  recordKey,
  sealContainer,
  type MergeConflict,
  type SyncRecord,
} from '../packages/sync/src/index.js'

const RECOVERY_CODE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
const LEDGER_ID = 'ledger-v5-spike'
const VALID_BUDGET_MS = 2000

interface Instance {
  deviceId: string
  rev: number
  records: Map<string, SyncRecord>
  conflicts: MergeConflict[]
  rejected: string[]
  duplicates: number
}

interface Timing {
  seal: number[]
  open: number[]
}

function newInstance(deviceId: string): Instance {
  return { deviceId, rev: 0, records: new Map(), conflicts: [], rejected: [], duplicates: 0 }
}

function localEdit(
  instance: Instance,
  entityType: string,
  entityId: string,
  data: SyncRecord['data'],
  deletedAt: string | null = null,
): void {
  const key = recordKey({ entityType, entityId })
  const current = instance.records.get(key)
  const rev = Math.max(instance.rev, current?.rev ?? 0) + 1
  instance.rev = rev
  const vector = parseVersionVector(current?.vv)
  vector[instance.deviceId] = rev
  instance.records.set(key, {
    entityType,
    entityId,
    rev,
    vv: encodeVersionVector(vector),
    deletedAt,
    data,
  })
}

function snapshot(instance: Instance): SyncRecord[] {
  return [...instance.records.values()]
    .map((record) => ({ ...record, vv: encodeVersionVector(parseVersionVector(record.vv)) }))
    .sort((left, right) => {
      const leftKey = recordKey(left)
      const rightKey = recordKey(right)
      return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0
    })
}

/** 真实文件落盘：先写 `.tmp` 再 rename，读者不会看到半个文件。 */
async function publish(instance: Instance, directory: string, timing: Timing): Promise<void> {
  const finalPath = join(directory, `${instance.deviceId}.mbx`)
  const tempPath = `${finalPath}.tmp`
  const started = performance.now()
  const bytes = await sealContainer([...instance.records.values()], RECOVERY_CODE, { ledgerId: LEDGER_ID })
  timing.seal.push(performance.now() - started)
  writeFileSync(tempPath, bytes)
  renameSync(tempPath, finalPath)
}

async function applyDirectory(
  instance: Instance,
  directory: string,
  timing: Timing,
  options: { reverse?: boolean; twice?: boolean } = {},
): Promise<{ applied: number; rejected: number; duplicates: number }> {
  let applied = 0
  let rejected = 0
  let duplicates = 0

  const files = readdirSync(directory)
    .filter((name) => name.endsWith('.mbx'))
    .sort()
  if (options.reverse) files.reverse()
  const plan = options.twice ? [...files, ...files] : files

  for (const name of plan) {
    const started = performance.now()
    let incoming: SyncRecord[]
    try {
      const opened = await openContainer(readFileSync(join(directory, name)), RECOVERY_CODE, {
        expectedLedgerId: LEDGER_ID,
      })
      incoming = opened.records
    } catch {
      instance.rejected.push(name)
      rejected += 1
      continue
    } finally {
      timing.open.push(performance.now() - started)
    }

    const result = mergeRecords(instance.records.values(), incoming)
    instance.records = new Map(result.records.map((record) => [recordKey(record), record]))
    instance.conflicts.push(...result.conflicts)
    instance.duplicates += result.duplicates
    duplicates += result.duplicates
    applied += 1
  }

  return { applied, rejected, duplicates }
}

function average(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function formatMs(value: number): string {
  return `${value.toFixed(1)} ms`
}

async function main(): Promise<void> {
  const keep = process.argv.includes('--keep')
  const directory = mkdtempSync(join(tmpdir(), 'moneybrain-v5-spike-'))
  const timing: Timing = { seal: [], open: [] }
  const first = newInstance('dev-a')
  const second = newInstance('dev-b')

  localEdit(first, 'account', 'acc-a', { name: '现金', balance: 1000 })
  localEdit(first, 'transaction', 'tx-a', { accountId: 'acc-a', amount: 250 })
  localEdit(first, 'transaction', 'tx-gone', { accountId: 'acc-a', amount: 90 })
  localEdit(first, 'transaction', 'tx-gone', { accountId: 'acc-a', amount: 90 }, '2026-11-05T00:00:00.000Z')
  localEdit(second, 'account', 'acc-b', { name: '银行卡', balance: 2000 })
  localEdit(second, 'transaction', 'tx-b', { accountId: 'acc-b', amount: 30 })
  // 两边同时创建同一 entityId：真并发，看看最终是不是同一版。
  localEdit(first, 'account', 'acc-shared', { name: '钱包', balance: 300 })
  localEdit(second, 'account', 'acc-shared', { name: '钱包', balance: 500 })

  console.log('V5 spike：两实例目录同步')
  console.log(
    `  账本 ${LEDGER_ID} · 设备 dev-a / dev-b · 目录 ${directory} · ` +
      `KDF t=${DEFAULT_KDF_PARAMS.t} m=${DEFAULT_KDF_PARAMS.m} p=${DEFAULT_KDF_PARAMS.p}`,
  )

  for (let round = 1; round <= 3; round += 1) {
    if (round === 2) {
      const valid = readFileSync(join(directory, 'dev-b.mbx'))
      writeFileSync(join(directory, 'torn.mbx'), valid.subarray(0, valid.length - 64))
      writeFileSync(join(directory, 'junk.mbx'), '这不是 MoneyBrain 容器')
    }

    await publish(first, directory, timing)
    await publish(second, directory, timing)

    const firstRound = await applyDirectory(first, directory, timing, { reverse: round === 2 })
    const secondRound = await applyDirectory(second, directory, timing, { reverse: round !== 2 })

    console.log(
      `  第 ${round} 轮：A 应用 ${firstRound.applied} / 拒绝 ${firstRound.rejected} / 重复 ${firstRound.duplicates}；` +
        `B 应用 ${secondRound.applied} / 拒绝 ${secondRound.rejected} / 重复 ${secondRound.duplicates}；` +
        `记录 A=${first.records.size} B=${second.records.size}`,
    )

    if (round === 2) {
      rmSync(join(directory, 'torn.mbx'), { force: true })
      rmSync(join(directory, 'junk.mbx'), { force: true })
    }
  }

  // 最后再来一轮「同一批复读两次」，专门验证幂等。
  await publish(first, directory, timing)
  await publish(second, directory, timing)
  const duplicated = await applyDirectory(first, directory, timing, { twice: true })
  await applyDirectory(second, directory, timing, { twice: true })
  console.log(`  收尾：A 复读两次，重复命中 ${duplicated.duplicates} 条（幂等分支）`)

  const left = snapshot(first)
  const right = snapshot(second)
  const identical = JSON.stringify(left) === JSON.stringify(right)
  const winnerOnFirst = first.records.get(recordKey({ entityType: 'account', entityId: 'acc-shared' }))
  const winnerOnSecond = second.records.get(recordKey({ entityType: 'account', entityId: 'acc-shared' }))
  const conflictWinnerMatches = JSON.stringify(winnerOnFirst) === JSON.stringify(winnerOnSecond)
  const tornRejected = first.rejected.includes('torn.mbx') && second.rejected.includes('torn.mbx')
  const junkRejected = first.rejected.includes('junk.mbx') && second.rejected.includes('junk.mbx')
  const sealMs = average(timing.seal)
  const openMs = average(timing.open)
  const kdfUnderBudget = sealMs < VALID_BUDGET_MS

  console.log('')
  console.log(`收敛：identical=${identical}；两实例各 ${left.length} 条记录（逐条逐字段一致）`)
  console.log(`并发冲突：A 检出 ${first.conflicts.length} 次、B 检出 ${second.conflicts.length} 次；生效版本一致=${conflictWinnerMatches}`)
  console.log(`半文件：torn.mbx（截断 64 字节）被拒绝=${tornRejected}；junk.mbx（非容器）被拒绝=${junkRejected}`)
  console.log(
    `KDF（默认参数）：seal ${timing.seal.length} 次平均 ${formatMs(sealMs)}；` +
      `open ${timing.open.length} 次平均 ${formatMs(openMs)}；验收线 ${VALID_BUDGET_MS} ms`,
  )
  console.log(
    `结论：${identical && tornRejected && junkRejected && conflictWinnerMatches && kdfUnderBudget ? '可冻结' : '需调整'}` +
      `（两实例收敛、乱序/重复/半文件均不出错、KDF ${kdfUnderBudget ? '达标' : '超标'}）`,
  )

  if (keep) console.log(`临时目录已保留：${directory}`)
  else rmSync(directory, { recursive: true, force: true })

  if (!(identical && tornRejected && junkRejected && conflictWinnerMatches && kdfUnderBudget)) {
    process.exitCode = 1
  }
}

await main()
