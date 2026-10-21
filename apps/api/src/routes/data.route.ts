import { Router, type Request } from 'express'
import { asyncHandler, success, validateRequest, ValidationError } from '../common/index.js'
import { requireClearConfirm } from '../common/validators.js'
import { CLEAR_CONFIRM } from '../../../../packages/contracts/constants.js'
import multer from 'multer'
import { exportTransactionsCSV } from '../services/export/transaction-export.service.js'
import { clearAllData, clearTransactionsOnly } from '../services/clear-data.service.js'
import { exportFullBackup, exportCustomBackup } from '../services/export/index.js'
import {
  ALL_DATA_TYPES,
  type DataType,
  generateBackupFilename,
  detectFileType,
  detectFileIncludes,
} from '../services/backup.service.js'
import { importBackup } from '../services/import/smart-import.service.js'

const router = Router()

const upload = multer({ storage: multer.memoryStorage() })

function isDataType(value: unknown): value is DataType {
  return typeof value === 'string' && ALL_DATA_TYPES.some((type) => type === value)
}

/** 解析导入范围；未传时表示按文件声明全量导入。 */
function parseImportIncludes(value: unknown): DataType[] | undefined {
  if (value === undefined || value === '') return undefined

  let parsed: unknown = value
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value)
    } catch {
      throw new ValidationError('includes 格式错误')
    }
  }

  if (!Array.isArray(parsed) || !parsed.every(isDataType)) {
    throw new ValidationError('includes 包含不支持的数据类型')
  }
  return parsed
}

/**
 * 清空数据是不可逆操作：调用方必须带正确的确认值。
 * 浏览器弹窗只是第一道防线，服务端这一道才是保证。
 */
router.delete('/all', validateRequest((req: Request) => {
  requireClearConfirm(req, CLEAR_CONFIRM.all)
}), asyncHandler(async (_req, res) => {
  await clearAllData()
  return success(res, { message: '所有数据已清空' })
}))

router.delete('/transactions', validateRequest((req: Request) => {
  requireClearConfirm(req, CLEAR_CONFIRM.transactions)
}), asyncHandler(async (_req, res) => {
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

// 文件内容识别
router.post('/detect-file', upload.single('file'), validateRequest((req: Request) => {
  if (!req.file) {
    throw new ValidationError('请上传文件')
  }
}), asyncHandler(async (req, res) => {
  const fileType = detectFileType(req.file!.originalname)
  const includes = await detectFileIncludes(req.file!.buffer, fileType)
  return success(res, { includes })
}))

// 完整备份导出
router.get('/export-full', asyncHandler(async (_req, res) => {
  const zipBuffer = await exportFullBackup()
  res.setHeader('Content-Type', 'application/zip')
  res.setHeader('Content-Disposition', `attachment; filename=${generateBackupFilename()}`)
  res.send(zipBuffer)
}))

// 自定义导出
router.post('/export-custom', validateRequest((req: Request) => {
  if (!req.body.includes || !Array.isArray(req.body.includes)) {
    throw new ValidationError('缺少includes参数或格式错误')
  }
  const invalid = req.body.includes.filter((item: unknown) => !ALL_DATA_TYPES.includes(item as DataType))
  if (invalid.length > 0) {
    throw new ValidationError(`包含不支持的数据类型: ${invalid.join(', ')}`)
  }
}), asyncHandler(async (req, res) => {
  const includes = req.body.includes as DataType[]
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
  const rawMode: unknown = req.body.mode
  if (rawMode !== undefined && rawMode !== 'merge' && rawMode !== 'overwrite') {
    throw new ValidationError('导入模式只支持 merge 或 overwrite')
  }
  const mode = rawMode === 'overwrite' ? 'overwrite' : 'merge'
  const includes = parseImportIncludes(req.body.includes)
  const result = await importBackup(req.file!.buffer, req.file!.originalname, mode, includes)
  return success(res, result)
}))

export default router
