import { Router, type Request } from 'express'
import { asyncHandler, success, validateRequest, ValidationError } from '../common/index.js'
import multer from 'multer'
import { exportTransactionsCSV, clearAllData, clearTransactionsOnly, exportConfig, exportBudgets, exportFullBackup, exportCustomBackup } from '../services/export.service.js'
import { importTransactionsFromCsv, importConfig, importBudgets, importBackup, type ImportFullResult } from '../services/import.service.js'

const router = Router()

const upload = multer({ storage: multer.memoryStorage() })

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

router.post('/import', upload.single('file'), validateRequest((req: Request) => {
  if (!req.file) {
    throw new ValidationError('请上传CSV文件')
  }
}), asyncHandler(async (req, res) => {
  const { startDate, endDate } = req.query
  
  let start: Date | undefined
  let end: Date | undefined
  
  if (startDate && typeof startDate === 'string') {
    start = new Date(startDate)
  }
  if (endDate && typeof endDate === 'string') {
    end = new Date(endDate)
  }
  
  const { imported, skipped } = await importTransactionsFromCsv(req.file!.buffer, start, end)
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

router.get('/export-budgets', asyncHandler(async (_req, res) => {
  const jsonContent = await exportBudgets()
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename=moneybrain-budgets-${new Date().toISOString().split('T')[0]}.json`)
  res.send(jsonContent)
}))

router.post('/import-budgets', upload.single('file'), validateRequest((req: Request) => {
  if (!req.file) {
    throw new ValidationError('请上传JSON文件')
  }
}), asyncHandler(async (req, res) => {
  const content = req.file!.buffer.toString('utf-8')
  let budgetData
  try {
    budgetData = JSON.parse(content)
  } catch {
    throw new ValidationError('JSON文件格式错误')
  }

  if (!budgetData.data || !budgetData.data.budgets) {
    throw new ValidationError('预算文件格式不正确，缺少data.budgets字段')
  }

  const result = await importBudgets(budgetData, 'merge')
  return success(res, result)
}))

// ─── 新的备份API路由 ───

// 完整备份导出
router.get('/export-full', asyncHandler(async (_req, res) => {
  const zipBuffer = await exportFullBackup()
  const date = new Date().toISOString().split('T')[0]
  res.setHeader('Content-Type', 'application/zip')
  res.setHeader('Content-Disposition', `attachment; filename=moneybrain-full-backup-${date}.zip`)
  res.send(zipBuffer)
}))

// 自定义导出
router.post('/export-custom', validateRequest((req: Request) => {
  if (!req.body.includes || !Array.isArray(req.body.includes)) {
    throw new ValidationError('缺少includes参数或格式错误')
  }
}), asyncHandler(async (req, res) => {
  const { includes } = req.body
  const result = await exportCustomBackup(includes)
  res.setHeader('Content-Type', result.contentType)
  res.setHeader('Content-Disposition', `attachment; filename=${result.filename}`)
  res.send(result.buffer)
}))

// 智能导入（支持ZIP、CSV、JSON）
router.post('/import-backup', upload.single('file'), validateRequest((req: Request) => {
  if (!req.file) {
    throw new ValidationError('请上传文件')
  }
}), asyncHandler(async (req, res) => {
  const mode = (req.body.mode as 'merge' | 'overwrite') || 'merge'
  const result = await importBackup(req.file!.buffer, req.file!.originalname, mode)
  return success(res, result)
}))

export default router
