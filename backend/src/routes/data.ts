import { Router } from 'express'
import { PrismaClient } from '@prisma/client'
import { success, error } from '../utils/response'
import multer from 'multer'

const router = Router()
const prisma = new PrismaClient()

const upload = multer({ storage: multer.memoryStorage() })

// 清空所有数据
router.delete('/all', async (req, res, next) => {
  try {
    await prisma.budgetAlert.deleteMany()
    await prisma.budget.deleteMany()
    await prisma.balanceSnapshot.deleteMany()
    await prisma.transaction.deleteMany()
    await prisma.account.deleteMany()
    
    const childCategories = await prisma.accountCategory.findMany({
      where: { parentId: { not: null } }
    })
    for (const child of childCategories) {
      await prisma.accountCategory.delete({ where: { id: child.id } })
    }
    await prisma.accountCategory.deleteMany()
    
    const childCategories2 = await prisma.category.findMany({
      where: { parentId: { not: null } }
    })
    for (const child of childCategories2) {
      await prisma.category.delete({ where: { id: child.id } })
    }
    await prisma.category.deleteMany()
    
    return success(res, { message: '所有数据已清空' })
  } catch (err) {
    return next(err)
  }
})

// 导出数据为CSV格式（钱迹格式）
router.get('/export', async (req, res, next) => {
  try {
    const transactions = await prisma.transaction.findMany({
      include: { account: true, toAccount: true, category: true },
      orderBy: { date: 'desc' },
    })

    const csvRows: string[] = []
    csvRows.push('ID,时间,分类,二级分类,类型,金额,币种,账户1,账户2,备注,已报销,手续费,优惠券,记账者,账单标记,标签,账单图片,关联账单')

    for (const t of transactions) {
      const id = `mb${Date.now()}${Math.random().toString(36).substr(2, 9)}`
      const date = new Date(t.date).toLocaleString('zh-CN', { hour12: false }).replace(/\//g, '-')
      const category1 = t.category?.name || '未分类'
      const category2 = ''
      const type = t.type === 'income' ? '收入' : t.type === 'transfer' ? '转账' : '支出'
      const amount = t.amount.toNumber()
      const currency = 'CNY'
      const account1 = t.account?.name || ''
      const account2 = t.toAccount?.name || ''
      const note = (t.note || '').replace(/,/g, '，').replace(/\n/g, ' ')
      const reimbursed = ''
      const fee = ''
      const coupon = ''
      const recorder = 'MoneyBrain'
      const billMark = ''
      const tags = ''
      const images = ''
      const relatedBill = ''

      csvRows.push(`${id},${date},${category1},${category2},${type},${amount},${currency},${account1},${account2},${note},${reimbursed},${fee},${coupon},${recorder},${billMark},${tags},${images},${relatedBill}`)
    }

    const csvContent = '\uFEFF' + csvRows.join('\n')
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename=moneybrain-export-${new Date().toISOString().split('T')[0]}.csv`)
    res.send(csvContent)
  } catch (err) {
    return next(err)
  }
})

// 导入CSV数据（钱迹格式）
router.post('/import', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      return error(res, '请上传CSV文件', 'BAD_REQUEST', 400)
    }

    const content = req.file.buffer.toString('utf-8')
    const lines = content.split('\n').filter(line => line.trim())
    
    if (lines.length < 2) {
      return error(res, 'CSV文件为空或格式错误', 'BAD_REQUEST', 400)
    }

    // 跳过标题行
    const dataLines = lines.slice(1)
    let imported = 0
    let skipped = 0
    const errors: string[] = []

    // 获取或创建默认账户分类
    let defaultAssetCategory = await prisma.accountCategory.findFirst({
      where: { type: 'asset', parentId: null }
    })
    if (!defaultAssetCategory) {
      defaultAssetCategory = await prisma.accountCategory.create({
        data: { name: '资产', type: 'asset', icon: 'wallet' }
      })
    }

    // 获取或创建默认负债分类
    let defaultLiabilityCategory = await prisma.accountCategory.findFirst({
      where: { type: 'liability', parentId: null }
    })
    if (!defaultLiabilityCategory) {
      defaultLiabilityCategory = await prisma.accountCategory.create({
        data: { name: '负债', type: 'liability', icon: 'credit-card' }
      })
    }

    // 缓存账户和分类
    const accountCache: Record<string, string> = {}
    const categoryCache: Record<string, string> = {}

    for (const line of dataLines) {
      try {
        const cols = parseCSVLine(line)
        if (cols.length < 9) {
          skipped++
          continue
        }

        const [, time, category1, category2, typeStr, amountStr, , account1, account2, note] = cols

        // 解析日期
        const date = new Date(time)
        if (isNaN(date.getTime())) {
          skipped++
          continue
        }

        // 解析金额
        const amount = parseFloat(amountStr)
        if (isNaN(amount)) {
          skipped++
          continue
        }

        // 解析类型
        let type: 'income' | 'expense' | 'transfer'
        if (typeStr === '收入') {
          type = 'income'
        } else if (typeStr === '转账' || typeStr === '还款') {
          type = 'transfer'
        } else {
          type = 'expense'
        }

        // 确定分类类型
        const categoryType = type === 'income' ? 'income' : type === 'expense' ? 'expense' : 'transfer'

        // 处理分类层级
        let categoryId: string
        const cacheKey = category2 ? `${category1}/${category2}` : category1
        
        if (categoryCache[cacheKey]) {
          categoryId = categoryCache[cacheKey]
        } else {
          // 如果有二级分类，先创建/查找一级分类
          let parentId: string | null = null
          if (category2) {
            // 检查一级分类缓存
            if (categoryCache[category1]) {
              parentId = categoryCache[category1]
            } else {
              // 查找或创建一级分类
              let parentCategory = await prisma.category.findFirst({
                where: { name: category1, parentId: null, type: categoryType }
              })
              if (!parentCategory) {
                parentCategory = await prisma.category.create({
                  data: {
                    name: category1,
                    type: categoryType,
                    icon: 'folder',
                  }
                })
              }
              parentId = parentCategory.id
              categoryCache[category1] = parentId
            }
          }

          // 创建/查找实际分类（可能是二级分类）
          const actualCategoryName = category2 || category1
          let category = await prisma.category.findFirst({
            where: { 
              name: actualCategoryName,
              parentId: parentId,
              type: categoryType
            }
          })
          if (!category) {
            category = await prisma.category.create({
              data: {
                name: actualCategoryName,
                type: categoryType,
                icon: 'circle',
                parentId: parentId,
              }
            })
          }
          categoryId = category.id
          categoryCache[cacheKey] = categoryId
        }

        // 获取或创建账户1
        let accountId = accountCache[account1]
        if (!accountId && account1) {
          let account = await prisma.account.findFirst({
            where: { name: account1 }
          })
          if (!account) {
            // 根据账户名判断类型
            const isLiability = ['花呗', '京东白条', '美团月付', '信用卡'].some(k => account1.includes(k))
            account = await prisma.account.create({
              data: {
                name: account1,
                type: isLiability ? 'liability' : 'asset',
                balance: 0,
                initialBalance: 0,
                categoryId: isLiability ? defaultLiabilityCategory.id : defaultAssetCategory.id,
                icon: isLiability ? 'credit-card' : 'wallet',
              }
            })
          }
          accountId = account.id
          accountCache[account1] = accountId
        }

        // 获取或创建账户2（转账目标）
        let toAccountId: string | null = null
        if (type === 'transfer' && account2) {
          toAccountId = accountCache[account2]
          if (!toAccountId) {
            let toAccount = await prisma.account.findFirst({
              where: { name: account2 }
            })
            if (!toAccount) {
              const isLiability = ['花呗', '京东白条', '美团月付', '信用卡'].some(k => account2.includes(k))
              toAccount = await prisma.account.create({
                data: {
                  name: account2,
                  type: isLiability ? 'liability' : 'asset',
                  balance: 0,
                  initialBalance: 0,
                  categoryId: isLiability ? defaultLiabilityCategory.id : defaultAssetCategory.id,
                  icon: isLiability ? 'credit-card' : 'wallet',
                }
              })
            }
            toAccountId = toAccount.id
            accountCache[account2] = toAccountId
          }
        }

        // 创建交易记录
        await prisma.transaction.create({
          data: {
            date,
            type,
            amount: Math.abs(amount),
            note: note || null,
            accountId: accountId!,
            toAccountId,
            categoryId,
          }
        })

        imported++
      } catch (err) {
        skipped++
        errors.push(`行解析错误: ${line.substring(0, 50)}...`)
      }
    }

    return success(res, { imported, skipped, errors: errors.slice(0, 10) })
  } catch (err) {
    return next(err)
  }
})

// 解析CSV行（处理引号内的逗号）
function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === '"') {
      inQuotes = !inQuotes
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }
  result.push(current.trim())

  return result
}

export default router
