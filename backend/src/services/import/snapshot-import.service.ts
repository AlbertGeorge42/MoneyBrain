// ─── 投资快照导入（CSV 格式） ───

import { prisma } from '../../index.js'
import { toDecimal } from '../../common/index.js'
import { Decimal } from '@prisma/client/runtime/library.js'
import {
  type ImportSnapshotCsvRow,
  type ImportSnapshotsResult,
  type TransactionClient,
  readCsvRecords,
  incImported,
  incUpdated,
  incSkipped,
} from './shared.js'

// ─── CSV Header 映射 ───

const SNAPSHOT_CSV_HEADER = [
  '账户名称',
  '快照日期',
  '账户余额',
  '上次快照日期',
  '备注',
  '资产类别',
  '市值',
  '期内净流入',
  '排序',
] as const

type SnapshotCsvField = typeof SNAPSHOT_CSV_HEADER[number]

/**
 * 从 CSV 导入投资快照
 * 资产类别已移至 config 导入，本函数只处理快照和分配项
 */
export async function importSnapshotsFromCsv(
  csvBuffer: Buffer | string,
  mode: 'merge' | 'overwrite',
  tx?: TransactionClient
): Promise<ImportSnapshotsResult> {
  const client = tx || prisma
  const result: ImportSnapshotsResult = {
    imported: { snapshots: 0, items: 0 },
    updated: { snapshots: 0 },
    skipped: { snapshots: 0 },
    errors: [],
  }

  const records = readCsvRecords<SnapshotCsvField>(csvBuffer, SNAPSHOT_CSV_HEADER)
  if (records.length === 0) {
    return result
  }

  // 解析所有行
  const rows: ImportSnapshotCsvRow[] = records.map(record => ({
    accountName: record['账户名称'],
    date: record['快照日期'],
    accountBalance: record['账户余额'],
    previousSnapshotDate: record['上次快照日期'],
    note: record['备注'],
    assetClassName: record['资产类别'],
    marketValue: record['市值'],
    periodNetFlow: record['期内净流入'],
    sort: record['排序'] || '0',
  }))

  // 按 (accountName, date) 分组，一个快照可能有多行（多个分配项）
  const snapshotMap = new Map<string, ImportSnapshotCsvRow[]>()
  for (const row of rows) {
    if (!row.accountName || !row.date) continue
    const key = `${row.accountName}|${row.date}`
    if (!snapshotMap.has(key)) {
      snapshotMap.set(key, [])
    }
    snapshotMap.get(key)!.push(row)
  }

  if (mode === 'overwrite') {
    await client.investmentAllocationItem.deleteMany()
    await client.investmentAllocationSnapshot.deleteMany()
  }

  // 按日期升序排序快照
  const sortedKeys = Array.from(snapshotMap.keys()).sort((a, b) => {
    const dateA = snapshotMap.get(a)![0].date
    const dateB = snapshotMap.get(b)![0].date
    return new Date(dateA).getTime() - new Date(dateB).getTime()
  })

  // 记录每个账户的快照链表
  const snapshotChainMap = new Map<string, Map<string, string>>()

  for (const key of sortedKeys) {
    const snapshotRows = snapshotMap.get(key)!
    const firstRow = snapshotRows[0]
    try {
      const account = await client.account.findFirst({
        where: { name: firstRow.accountName },
      })
      if (!account) {
        result.errors.push(`投资快照关联账户不存在: ${firstRow.accountName}`)
        incSkipped(result, 'snapshots')
        continue
      }

      // 验证所有资产类别
      const items: { assetClassId: string; marketValue: Decimal; periodNetFlow: Decimal; sort: number }[] = []
      let allAssetClassesValid = true
      for (const row of snapshotRows) {
        if (!row.assetClassName) continue

        const assetClass = await client.investmentAssetClass.findFirst({
          where: { accountId: account.id, name: row.assetClassName },
        })
        if (!assetClass) {
          result.errors.push(
            `投资资产类别不存在: ${row.assetClassName} (账户: ${firstRow.accountName})`
          )
          allAssetClassesValid = false
          break
        }
        items.push({
          assetClassId: assetClass.id,
          marketValue: toDecimal(row.marketValue || 0),
          periodNetFlow: toDecimal(row.periodNetFlow || 0),
          sort: parseInt(row.sort, 10) || 0,
        })
      }
      if (!allAssetClassesValid) {
        incSkipped(result, 'snapshots')
        continue
      }

      const snapshotDate = new Date(firstRow.date)
      if (isNaN(snapshotDate.getTime())) {
        result.errors.push(`投资快照日期格式错误: ${firstRow.date}`)
        incSkipped(result, 'snapshots')
        continue
      }

      // 确定 previousSnapshotId
      let previousSnapshotId: string | null = null
      const accountChain = snapshotChainMap.get(account.id)
      if (firstRow.previousSnapshotDate && accountChain?.has(firstRow.previousSnapshotDate)) {
        previousSnapshotId = accountChain.get(firstRow.previousSnapshotDate)!
      } else {
        if (accountChain) {
          const sortedDates = Array.from(accountChain.keys()).sort(
            (a, b) => new Date(b).getTime() - new Date(a).getTime()
          )
          for (const d of sortedDates) {
            if (new Date(d) < snapshotDate) {
              previousSnapshotId = accountChain.get(d)!
              break
            }
          }
        }
      }

      const existing = await client.investmentAllocationSnapshot.findFirst({
        where: { accountId: account.id, date: snapshotDate },
      })

      const accountBalance = toDecimal(firstRow.accountBalance || 0)
      const note = firstRow.note || null

      if (existing) {
        if (mode === 'merge') {
          await client.investmentAllocationSnapshot.update({
            where: { id: existing.id },
            data: {
              accountBalance,
              previousSnapshotId,
              note,
            },
          })

          await client.investmentAllocationItem.deleteMany({
            where: { snapshotId: existing.id },
          })

          for (const item of items) {
            await client.investmentAllocationItem.create({
              data: { snapshotId: existing.id, ...item },
            })
            incImported(result, 'items')
          }

          if (!accountChain) snapshotChainMap.set(account.id, new Map())
          snapshotChainMap.get(account.id)!.set(firstRow.date, existing.id)

          incUpdated(result, 'snapshots')
        } else {
          incSkipped(result, 'snapshots')
        }
      } else {
        const newSnapshot = await client.investmentAllocationSnapshot.create({
          data: {
            accountId: account.id,
            date: snapshotDate,
            accountBalance,
            previousSnapshotId,
            note,
          },
        })

        for (const item of items) {
          await client.investmentAllocationItem.create({
            data: { snapshotId: newSnapshot.id, ...item },
          })
          incImported(result, 'items')
        }

        if (!accountChain) snapshotChainMap.set(account.id, new Map())
        snapshotChainMap.get(account.id)!.set(firstRow.date, newSnapshot.id)

        incImported(result, 'snapshots')
      }
    } catch (error) {
      result.errors.push(`投资快照导入失败: ${(error as Error).message}`)
    }
  }

  return result
}
