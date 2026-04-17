import { Router, type Request } from 'express'
import { asyncHandler, success, validateRequest, ValidationError } from '../common/index.js'
import multer from 'multer'
import { exportTransactionsCSV, clearAllData, clearTransactionsOnly, parseCSVLine } from '../services/data.service.js'
import { importTransactionsFromRows, type ParsedRow } from '../services/import.service.js'

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

router.post('/import', upload.single('file'), validateRequest(validateImportRequest), asyncHandler(async (req, res) => {
  const content = req.file!.buffer.toString('utf-8')
  const lines = content.split('\n').filter(line => line.trim())

  if (lines.length < 2) {
    throw new ValidationError('CSV文件为空或格式错误')
  }

  const dataLines = lines.slice(1)
  const parsedRows: ParsedRow[] = []

  for (const line of dataLines) {
    try {
      const cols = parseCSVLine(line)
      if (cols.length < 9) continue

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
    } catch {
      // skip invalid lines
    }
  }

  const { imported, skipped } = await importTransactionsFromRows(parsedRows)

  return success(res, { imported, skipped, errors: [] })
}))

export default router
