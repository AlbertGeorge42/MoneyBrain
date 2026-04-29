import { Router, type Request } from 'express'
import { asyncHandler, success, validateRequest, ValidationError } from '../common/index.js'
import multer from 'multer'
import { exportTransactionsCSV, clearAllData, clearTransactionsOnly, parseCSVLine } from '../services/data.service.js'
import { importTransactionsFromRows, type ParsedRow } from '../services/import.service.js'
import { exportConfig } from '../services/config-export.service.js'
import { importConfig } from '../services/config-import.service.js'

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

router.get('/export', asyncHandler(async (req, res) => {
  const { startDate, endDate } = req.query
  
  let start: Date | undefined
  let end: Date | undefined
  
  if (startDate && typeof startDate === 'string') {
    start = new Date(startDate)
  }
  if (endDate && typeof endDate === 'string') {
    end = new Date(endDate)
  }
  
  const csvContent = await exportTransactionsCSV(start, end)
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename=moneybrain-export-${new Date().toISOString().split('T')[0]}.csv`)
  res.send(csvContent)
}))

router.post('/import', upload.single('file'), validateRequest(validateImportRequest), asyncHandler(async (req, res) => {
  const { startDate, endDate } = req.query
  
  let start: Date | undefined
  let end: Date | undefined
  
  if (startDate && typeof startDate === 'string') {
    start = new Date(startDate)
  }
  if (endDate && typeof endDate === 'string') {
    end = new Date(endDate)
  }
  
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

  const { imported, skipped } = await importTransactionsFromRows(parsedRows, start, end)

  return success(res, { imported, skipped, errors: [] })
}))

router.get('/export-config', asyncHandler(async (_req, res) => {
  const jsonContent = await exportConfig()
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename=moneybrain-config-${new Date().toISOString().split('T')[0]}.json`)
  res.send(jsonContent)
}))

router.post('/import-config', upload.single('file'), validateRequest((req: Request) => {
  if (!req.file) {
    throw new ValidationError('请上传JSON文件')
  }
}), asyncHandler(async (req, res) => {
  const content = req.file!.buffer.toString('utf-8')
  let configData
  try {
    configData = JSON.parse(content)
  } catch {
    throw new ValidationError('JSON文件格式错误')
  }

  if (!configData.data) {
    throw new ValidationError('配置文件格式不正确，缺少data字段')
  }

  const result = await importConfig(configData, 'merge')
  return success(res, result)
}))

export default router
