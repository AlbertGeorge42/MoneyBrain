import { Router, type Request } from 'express'
import { prisma } from '../index.js'
import { success } from '../utils/response.js'
import multer from 'multer'
import { exportTransactionsCSV, clearAllData, clearTransactionsOnly, parseCSVLine } from '../services/data.service.js'
import {
  getNextAccountCategorySort,
  getNextAccountSort,
  getNextTransactionCategorySort,
} from '../services/sort.service.js'
import { ValidationError } from '../errors/index.js'
import { asyncHandler } from '../utils/async-handler.js'
import { validateRequest } from '../middleware/validate-request.js'

const router = Router()

const upload = multer({ storage: multer.memoryStorage() })

const validateImportRequest = (req: Request) => {
  if (!req.file) {
    throw new ValidationError('请上传CSV文件')
  }
}

router.delete('/all', asyncHandler(async (_req, res) => {
  await clearAllData()
  return success(res, { message: '所有数据已清空' })
}))

router.delete('/transactions', asyncHandler(async (_req, res) => {
  await clearTransactionsOnly()
  return success(res, { message: '交易数据已清空' })
}))

router.get('/export', asyncHandler(async (_req, res) => {
  const csvContent = await exportTransactionsCSV()
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename=moneybrain-export-${new Date().toISOString().split('T')[0]}.csv`)
  res.send(csvContent)
}))

async function getOrCreateTransferSubCategory(name: string): Promise<string> {
  let category = await prisma.transactionCategory.findFirst({
    where: { name, type: 'transfer', parentId: null },
  })
  if (!category) {
    const sort = await getNextTransactionCategorySort('transfer', null)
    category = await prisma.transactionCategory.create({
      data: { name, type: 'transfer', icon: 'arrow-right', sort },
    })
  }
  return category.id
}

async function classifyTransfer(
  fromAccount: { id: string; type: string; categoryId: string | null } | null,
  toAccount: { id: string; type: string; categoryId: string | null } | null
): Promise<string> {
  if (toAccount?.type === 'liability') {
    return getOrCreateTransferSubCategory('还款')
  }
  if (fromAccount?.type === 'liability') {
    return getOrCreateTransferSubCategory('借贷')
  }
  if (toAccount?.categoryId) {
    const toCategory = await prisma.accountCategory.findUnique({
      where: { id: toAccount.categoryId },
    })
    if (toCategory?.isInvestment) {
      return getOrCreateTransferSubCategory('买入')
    }
  }
  if (fromAccount?.categoryId) {
    const fromCategory = await prisma.accountCategory.findUnique({
      where: { id: fromAccount.categoryId },
    })
    if (fromCategory?.isInvestment) {
      return getOrCreateTransferSubCategory('卖出')
    }
  }
  return getOrCreateTransferSubCategory('转账')
}

router.post('/import', upload.single('file'), validateRequest(validateImportRequest), asyncHandler(async (req, res) => {
    const content = req.file!.buffer.toString('utf-8')
    const lines = content.split('\n').filter(line => line.trim())

    if (lines.length < 2) {
      throw new ValidationError('CSV文件为空或格式错误')
    }

    const dataLines = lines.slice(1)
    let imported = 0
    let skipped = 0
    const errors: string[] = []

    let defaultAssetCategory = await prisma.accountCategory.findFirst({
      where: { type: 'asset', parentId: null },
    })
    if (!defaultAssetCategory) {
      const sort = await getNextAccountCategorySort('asset')
      defaultAssetCategory = await prisma.accountCategory.create({
        data: { name: '资产', type: 'asset', icon: 'wallet', sort },
      })
    }

    let defaultLiabilityCategory = await prisma.accountCategory.findFirst({
      where: { type: 'liability', parentId: null },
    })
    if (!defaultLiabilityCategory) {
      const sort = await getNextAccountCategorySort('liability')
      defaultLiabilityCategory = await prisma.accountCategory.create({
        data: { name: '负债', type: 'liability', icon: 'credit-card', sort },
      })
    }

    const accountCache: Record<string, { id: string; type: string; categoryId: string | null }> = {}
    const categoryCache: Record<string, string> = {}
    const idMapping: Record<string, string> = {}
    
    interface ParsedRow {
      csvId: string
      time: string
      category1: string
      category2: string
      typeStr: string
      amountStr: string
      account1: string
      account2: string
      note: string
      fee: number
      coupon: number
      relatedCsvId: string
    }
    
    const parsedRows: ParsedRow[] = []
    
    for (const line of dataLines) {
      try {
        const cols = parseCSVLine(line)
        if (cols.length < 9) {
          skipped++
          continue
        }
        
        const [csvId, time, category1, category2, typeStr, amountStr, , account1, account2, note, , feeStr, couponStr, , , , , relatedCsvId] = cols
        
        parsedRows.push({
          csvId,
          time,
          category1,
          category2,
          typeStr,
          amountStr,
          account1,
          account2,
          note,
          fee: feeStr ? parseFloat(feeStr) || 0 : 0,
          coupon: couponStr ? parseFloat(couponStr) || 0 : 0,
          relatedCsvId,
        })
      } catch (err) {
        skipped++
      }
    }
    
    const refundRows = parsedRows.filter(r => r.typeStr === '退款')
    const normalRows = parsedRows.filter(r => r.typeStr !== '退款')
    
    for (const row of normalRows) {
      try {
        const { csvId, time, category1, category2, typeStr, amountStr, account1, account2, note } = row
        
        const date = new Date(time)
        if (isNaN(date.getTime())) {
          skipped++
          continue
        }

        const amount = parseFloat(amountStr)
        if (isNaN(amount)) {
          skipped++
          continue
        }

        let type: 'income' | 'expense' | 'transfer'
        if (typeStr === '收入' || typeStr === '报销记录') {
          type = 'income'
        } else if (typeStr === '转账' || typeStr === '还款') {
          type = 'transfer'
        } else {
          type = 'expense'
        }

        const categoryType = type === 'income' ? 'income' : type === 'expense' ? 'expense' : 'transfer'

        let categoryId: string
        const cacheKey = category2 ? `${category1}/${category2}` : category1
        const typedCacheKey = `${categoryType}:${cacheKey}`
        
        if (categoryCache[typedCacheKey]) {
          categoryId = categoryCache[typedCacheKey]
        } else {
          let parentId: string | null = null
          if (category2) {
            const parentCacheKey = `${categoryType}:${category1}`
            if (categoryCache[parentCacheKey]) {
              parentId = categoryCache[parentCacheKey]
            } else {
              let parentCategory = await prisma.transactionCategory.findFirst({
                where: { name: category1, parentId: null, type: categoryType },
              })
              if (!parentCategory) {
                const sort = await getNextTransactionCategorySort(categoryType, null)
                parentCategory = await prisma.transactionCategory.create({
                  data: {
                    name: category1,
                    type: categoryType,
                    icon: 'folder',
                    sort,
                  },
                })
              }
              parentId = parentCategory.id
              categoryCache[parentCacheKey] = parentId
            }
          }

          const actualCategoryName = category2 || category1
          let category = await prisma.transactionCategory.findFirst({
            where: { 
              name: actualCategoryName,
              parentId: parentId,
              type: categoryType,
            },
          })
          if (!category) {
            const sort = await getNextTransactionCategorySort(categoryType, parentId)
            category = await prisma.transactionCategory.create({
              data: {
                name: actualCategoryName,
                type: categoryType,
                icon: 'circle',
                parentId: parentId,
                sort,
              },
            })
          }
          categoryId = category.id
          categoryCache[typedCacheKey] = categoryId
        }

        let accountData = accountCache[account1]
        if (!accountData && account1) {
          let account = await prisma.account.findFirst({
            where: { name: account1 },
          })
          if (!account) {
            const sort = await getNextAccountSort(defaultAssetCategory.id)
            account = await prisma.account.create({
              data: {
                name: account1,
                type: 'asset',
                balance: 0,
                initialBalance: 0,
                categoryId: defaultAssetCategory.id,
                icon: 'wallet',
                sort,
              },
            })
          }
          accountData = { id: account.id, type: account.type, categoryId: account.categoryId }
          accountCache[account1] = accountData
        }

        let toAccountData: { id: string; type: string; categoryId: string | null } | null = null
        if (type === 'transfer' && account2) {
          let toAccount = await prisma.account.findFirst({
            where: { name: account2 },
          })
          
          if (toAccount) {
            if (typeStr === '还款' && toAccount.type === 'asset') {
              toAccount = await prisma.account.update({
                where: { id: toAccount.id },
                data: { 
                  type: 'liability',
                  categoryId: defaultLiabilityCategory.id 
                },
              })
              accountCache[account2] = { id: toAccount.id, type: toAccount.type, categoryId: toAccount.categoryId }
            }
            toAccountData = { id: toAccount.id, type: toAccount.type, categoryId: toAccount.categoryId }
          } else {
            const inferredType = typeStr === '还款' ? 'liability' : 'asset'
            const inferredCategoryId = inferredType === 'liability' 
              ? defaultLiabilityCategory.id 
              : defaultAssetCategory.id
            
            const sort = await getNextAccountSort(inferredCategoryId)
            toAccount = await prisma.account.create({
              data: {
                name: account2,
                type: inferredType,
                balance: 0,
                initialBalance: 0,
                categoryId: inferredCategoryId,
                icon: inferredType === 'liability' ? 'credit-card' : 'wallet',
                sort,
              },
            })
            toAccountData = { id: toAccount.id, type: toAccount.type, categoryId: toAccount.categoryId }
          }
          accountCache[account2] = toAccountData
        }

        let finalCategoryId = categoryId
        if (type === 'transfer') {
          finalCategoryId = await classifyTransfer(accountData || null, toAccountData)
        }

        const transaction = await prisma.transaction.create({
          data: {
            date,
            type,
            amount: Math.abs(amount),
            fee: row.fee || 0,
            coupon: row.coupon || 0,
            note: note || null,
            accountId: accountData!.id,
            toAccountId: toAccountData?.id || null,
            categoryId: finalCategoryId,
          },
        })
        
        idMapping[csvId] = transaction.id
        imported++
      } catch (err) {
        skipped++
        errors.push('行解析错误')
      }
    }
    
    for (const row of refundRows) {
      try {
        const { csvId, time, category1, category2, amountStr, account1, note, relatedCsvId } = row
        
        const date = new Date(time)
        if (isNaN(date.getTime())) {
          skipped++
          continue
        }

        const amount = parseFloat(amountStr)
        if (isNaN(amount)) {
          skipped++
          continue
        }

        let relatedTransactionId: string | null = null
        if (relatedCsvId && idMapping[relatedCsvId]) {
          relatedTransactionId = idMapping[relatedCsvId]
        }

        let categoryId: string | null = null
        const cacheKey = category2 ? `${category1}/${category2}` : category1
        for (const possibleType of ['expense', 'income']) {
          const typedCacheKey = `${possibleType}:${cacheKey}`
          if (categoryCache[typedCacheKey]) {
            categoryId = categoryCache[typedCacheKey]
            break
          }
        }
        if (!categoryId) {
          for (const possibleType of ['expense', 'income']) {
            const parentCacheKey = `${possibleType}:${category1}`
            if (categoryCache[parentCacheKey]) {
              categoryId = categoryCache[parentCacheKey]
              break
            }
          }
        }

        let accountData = accountCache[account1]
        if (!accountData && account1) {
          let account = await prisma.account.findFirst({
            where: { name: account1 },
          })
          if (!account) {
            const sort = await getNextAccountSort(defaultAssetCategory.id)
            account = await prisma.account.create({
              data: {
                name: account1,
                type: 'asset',
                balance: 0,
                initialBalance: 0,
                categoryId: defaultAssetCategory.id,
                icon: 'wallet',
                sort,
              },
            })
          }
          accountData = { id: account.id, type: account.type, categoryId: account.categoryId }
          accountCache[account1] = accountData
        }

        const transaction = await prisma.transaction.create({
          data: {
            date,
            type: 'refund',
            amount: Math.abs(amount),
            fee: row.fee || 0,
            coupon: row.coupon || 0,
            note: note || null,
            accountId: accountData!.id,
            categoryId,
            relatedTransactionId,
          },
        })
        
        idMapping[csvId] = transaction.id
        imported++
      } catch (err) {
        skipped++
        errors.push('退款记录解析错误')
      }
    }

    return success(res, { imported, skipped, errors: errors.slice(0, 10) })
}))

export default router
