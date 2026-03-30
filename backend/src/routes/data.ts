import { Router } from 'express'
import { prisma } from '../index.js'
import { success, error } from '../utils/response.js'
import multer from 'multer'
import { exportTransactionsCSV, clearAllData, parseCSVLine } from '../services/data.service.js'

const router = Router()

const upload = multer({ storage: multer.memoryStorage() })

router.delete('/all', async (_req, res, next) => {
  try {
    await clearAllData()
    return success(res, { message: '所有数据已清空' })
  } catch (err) {
    return next(err)
  }
})

router.get('/export', async (_req, res, next) => {
  try {
    const csvContent = await exportTransactionsCSV()
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename=moneybrain-export-${new Date().toISOString().split('T')[0]}.csv`)
    res.send(csvContent)
  } catch (err) {
    return next(err)
  }
})

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

    const dataLines = lines.slice(1)
    let imported = 0
    let skipped = 0
    const errors: string[] = []

    let defaultAssetCategory = await prisma.accountCategory.findFirst({
      where: { type: 'asset', parentId: null }
    })
    if (!defaultAssetCategory) {
      defaultAssetCategory = await prisma.accountCategory.create({
        data: { name: '资产', type: 'asset', icon: 'wallet' }
      })
    }

    let defaultLiabilityCategory = await prisma.accountCategory.findFirst({
      where: { type: 'liability', parentId: null }
    })
    if (!defaultLiabilityCategory) {
      defaultLiabilityCategory = await prisma.accountCategory.create({
        data: { name: '负债', type: 'liability', icon: 'credit-card' }
      })
    }

    const accountCache: Record<string, string> = {}
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
          // 支出、报销等类型都转为支出
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
                where: { name: category1, parentId: null, type: categoryType }
              })
              if (!parentCategory) {
                parentCategory = await prisma.transactionCategory.create({
                  data: {
                    name: category1,
                    type: categoryType,
                    icon: 'folder',
                  }
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
              type: categoryType
            }
          })
          if (!category) {
            category = await prisma.transactionCategory.create({
              data: {
                name: actualCategoryName,
                type: categoryType,
                icon: 'circle',
                parentId: parentId,
              }
            })
          }
          categoryId = category.id
          categoryCache[typedCacheKey] = categoryId
        }

        let accountId = accountCache[account1]
        if (!accountId && account1) {
          let account = await prisma.account.findFirst({
            where: { name: account1 }
          })
          if (!account) {
            account = await prisma.account.create({
              data: {
                name: account1,
                type: 'asset',
                balance: 0,
                initialBalance: 0,
                categoryId: defaultAssetCategory.id,
                icon: 'wallet',
              }
            })
          }
          accountId = account.id
          accountCache[account1] = accountId
        }

        let toAccountId: string | null = null
        if (type === 'transfer' && account2) {
          let toAccount = await prisma.account.findFirst({
            where: { name: account2 }
          })
          
          if (toAccount && typeStr === '还款' && toAccount.type === 'asset') {
            toAccount = await prisma.account.update({
              where: { id: toAccount.id },
              data: { 
                type: 'liability',
                categoryId: defaultLiabilityCategory.id,
              },
            })
          }
          
          toAccountId = accountCache[account2]
          if (!toAccountId) {
            if (!toAccount) {
              const isLiability = typeStr === '还款'
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

        const transaction = await prisma.transaction.create({
          data: {
            date,
            type,
            amount: Math.abs(amount),
            fee: row.fee || 0,
            coupon: row.coupon || 0,
            note: note || null,
            accountId: accountId!,
            toAccountId,
            categoryId,
          }
        })
        
        idMapping[csvId] = transaction.id
        imported++
      } catch (err) {
        skipped++
        errors.push(`行解析错误`)
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

        let accountId = accountCache[account1]
        if (!accountId && account1) {
          let account = await prisma.account.findFirst({
            where: { name: account1 }
          })
          if (!account) {
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

        const transaction = await prisma.transaction.create({
          data: {
            date,
            type: 'refund',
            amount: Math.abs(amount),
            fee: row.fee || 0,
            coupon: row.coupon || 0,
            note: note || null,
            accountId: accountId!,
            categoryId,
            relatedTransactionId,
          }
        })
        
        idMapping[csvId] = transaction.id
        imported++
      } catch (err) {
        skipped++
        errors.push(`退款记录解析错误`)
      }
    }

    return success(res, { imported, skipped, errors: errors.slice(0, 10) })
  } catch (err) {
    return next(err)
  }
})

export default router
