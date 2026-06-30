/**
 * 数据修复脚本：合并重复的 transaction_categories
 *
 * 问题背景：数据库中存在同名分类，例如：
 *   - 餐饮 (parent) → 三餐 (child, id=400f0ed3, 0 transactions)
 *   - 三餐 (top-level, id=c50401a9, 14085 worth of transactions)
 *
 * 交易记录都关联到顶层版本，导致饼图同时显示两个"三餐"，
 * 父级 餐饮 永远下钻不到有数据的内容。
 *
 * 修复策略：对每个同名 type 的分类组
 *   1. 选"主分类"（优先级：有父级 > 名字含子分类特征 > ID 最小）
 *   2. 把其他重复分类的 transactions.categoryId 改成主分类
 *   3. 把 budgets.categoryId 改成主分类
 *   4. 把其他重复分类的子分类（如果有）的 parentId 改成主分类
 *   5. 删除其他重复分类
 *
 * 使用方法：
 *   cd backend && npx tsx prisma/fix-duplicate-categories.ts
 *   npx tsx prisma/fix-duplicate-categories.ts --dry-run   # 仅打印，不写入
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

interface Group {
  name: string
  type: string
  ids: string[]
}

interface PickResult {
  primaryId: string
  duplicates: { id: string; name: string; type: string; parentId: string | null; txCount: number }[]
}

const DRY_RUN = process.argv.includes('--dry-run')

async function main() {
  console.log(`[fix-duplicate-categories] ${DRY_RUN ? 'DRY RUN' : 'RUN'} 模式`)

  // 1. 找出所有同名+同 type 的分类组
  const all = await prisma.transactionCategory.findMany({
    include: { _count: { select: { transactions: true, budgets: true, children: true } } },
  })

  const groupMap = new Map<string, typeof all>()
  for (const cat of all) {
    const key = `${cat.type}::${cat.name}`
    if (!groupMap.has(key)) groupMap.set(key, [])
    groupMap.get(key)!.push(cat)
  }

  const dupGroups: Group[] = []
  for (const [key, cats] of groupMap.entries()) {
    if (cats.length > 1) {
      const [type, name] = key.split('::')
      dupGroups.push({ name, type, ids: cats.map(c => c.id) })
    }
  }

  console.log(`发现 ${dupGroups.length} 组重复分类`)

  // 2. 处理每组
  let mergedCount = 0
  let txMovedTotal = 0
  let budgetMovedTotal = 0
  let childReparentTotal = 0

  for (const group of dupGroups) {
    const cats = await prisma.transactionCategory.findMany({
      where: { name: group.name, type: group.type },
      include: { _count: { select: { transactions: true, budgets: true, children: true } } },
    })

    // 选主分类：优先有父级 > 名字含子分类特征 > ID 字典序最小
    const sorted = [...cats].sort((a, b) => {
      // 1. 有 parentId 的优先
      const aHasParent = a.parentId ? 1 : 0
      const bHasParent = b.parentId ? 1 : 0
      if (aHasParent !== bHasParent) return bHasParent - aHasParent

      // 2. 有子分类的优先（看起来更像"真正的父级"）
      const aChildren = a._count.children
      const bChildren = b._count.children
      if (aChildren !== bChildren) return bChildren - aChildren

      // 3. 关联交易数多的优先
      const aTx = a._count.transactions
      const bTx = b._count.transactions
      if (aTx !== bTx) return bTx - aTx

      // 4. ID 字典序
      return a.id.localeCompare(b.id)
    })

    const primary = sorted[0]
    const duplicates = sorted.slice(1)

    console.log(`\n[${group.type}] ${group.name} (主分类: ${primary.id})`)
    for (const d of duplicates) {
      console.log(
        `  - 重复: ${d.id} (parent=${d.parentId ?? 'null'}, ` +
        `tx=${d._count.transactions}, budgets=${d._count.budgets}, ` +
        `children=${d._count.children})`
      )
    }

    if (DRY_RUN) continue

    // 在事务中执行修复
    await prisma.$transaction(async (tx) => {
      for (const d of duplicates) {
        // 3. 迁移 transactions
        const txResult = await tx.transaction.updateMany({
          where: { categoryId: d.id },
          data: { categoryId: primary.id },
        })
        if (txResult.count > 0) {
          console.log(`    迁移 ${txResult.count} 条 transactions: ${d.id} → ${primary.id}`)
          txMovedTotal += txResult.count
        }

        // 4. 迁移 budgets
        const budgetResult = await tx.budget.updateMany({
          where: { categoryId: d.id },
          data: { categoryId: primary.id },
        })
        if (budgetResult.count > 0) {
          console.log(`    迁移 ${budgetResult.count} 条 budgets: ${d.id} → ${primary.id}`)
          budgetMovedTotal += budgetResult.count
        }

        // 5. 迁移子分类的 parentId
        const childResult = await tx.transactionCategory.updateMany({
          where: { parentId: d.id },
          data: { parentId: primary.id },
        })
        if (childResult.count > 0) {
          console.log(`    重新挂载 ${childResult.count} 个子分类到 ${primary.id}`)
          childReparentTotal += childResult.count
        }

        // 6. 删除重复分类
        await tx.transactionCategory.delete({ where: { id: d.id } })
        console.log(`    已删除 ${d.id}`)
        mergedCount++
      }
    })
  }

  console.log('\n===== 修复汇总 =====')
  console.log(`合并分类数: ${mergedCount}`)
  console.log(`迁移交易: ${txMovedTotal} 条`)
  console.log(`迁移预算: ${budgetMovedTotal} 条`)
  console.log(`重新挂载子分类: ${childReparentTotal} 个`)
  if (DRY_RUN) {
    console.log('\n（DRY RUN：未写入数据库）')
  }
}

main()
  .catch((err) => {
    console.error('修复失败:', err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
