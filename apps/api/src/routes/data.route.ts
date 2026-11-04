import { Router, type Request } from 'express'
import { asyncHandler, formatDateLocal, success, validateRequest, ValidationError } from '../common/index.js'
import { requireClearConfirm } from '../common/validators.js'
import { CLEAR_CONFIRM, ROLLBACK_CONFIRM } from '../../../../packages/contracts/constants.js'
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
import {
  importBackup,
  importBackupWithRollback,
  previewImport,
  resolveOverwriteScope,
} from '../services/import/smart-import.service.js'
import {
  listSnapshotPoints,
  restoreSnapshot,
  deleteSnapshot,
} from '../services/rollback.service.js'
import {
  countAutoBackups,
  getAutoBackupConfig,
  runExclusiveLongTask,
  saveAutoBackupConfig,
} from '../services/auto-backup.service.js'

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

  // 长任务：导出进行中不让自动备份抢 IO
  const csvContent = await runExclusiveLongTask(() => exportTransactionsCSV(start, end))
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename=moneybrain-export-${formatDateLocal(new Date())}.csv`)
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
  const zipBuffer = await runExclusiveLongTask(() => exportFullBackup())
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
  const result = await runExclusiveLongTask(() => exportCustomBackup(includes))
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

  // 覆盖导入会先清空数据，先留回滚点再执行——出错还有退路。
  // 长任务：导入进行中不让自动备份抢 IO
  if (mode === 'overwrite') {
    const { result, rollbackPointId } = await runExclusiveLongTask(() =>
      importBackupWithRollback(req.file!.buffer, req.file!.originalname, includes)
    )
    return success(res, { ...result, rollbackPointId })
  }

  const result = await runExclusiveLongTask(() =>
    importBackup(req.file!.buffer, req.file!.originalname, mode, includes)
  )
  return success(res, result)
}))

// 导入预览：跑一遍真实导入再回滚，让用户先看到数字。
// 与正式导入走同一个 runImport，数字必然一致。
router.post('/import-preview', upload.single('file'), validateRequest((req: Request) => {
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

  const result = await runExclusiveLongTask(() =>
    previewImport(req.file!.buffer, req.file!.originalname, mode, includes)
  )
  const willOverwrite = mode === 'overwrite'
    ? await resolveOverwriteScope(req.file!.buffer, req.file!.originalname, includes)
    : []
  return success(res, { result, willOverwrite })
}))

// 回滚点列表
router.get('/rollback-points', asyncHandler(async (_req, res) => {
  const points = await listSnapshotPoints()
  return success(res, points)
}))

// ─── 自动定时备份（B3）───
// 备份时机由内部策略决定（24h 间隔 + 空闲窗口，见 service 头注释），用户只设置开关与目录。
// 过渡态约束：F5 加密容器落地前导出的是明文 ZIP，云同步目录默认拒绝、需显式确认。
router.get('/auto-backup', asyncHandler(async (_req, res) => {
  const config = await getAutoBackupConfig()
  return success(res, {
    enabled: config.enabled,
    directory: config.directory,
    defaultDirectory: config.defaultDirectory,
    lastRunAt: config.lastRunAt,
    lastRunError: config.lastRunError,
    // 预计下次窗口 = 上次成功 + 24h；从未成功过则首次空闲窗口即可
    nextWindowAt: config.lastRunAt
      ? new Date(new Date(config.lastRunAt).getTime() + 24 * 60 * 60_000).toISOString()
      : null,
    backupCount: countAutoBackups(config.directory),
  })
}))

router.put('/auto-backup', validateRequest((req: Request) => {
  const { enabled, directory, confirmCloudDirectory } = req.body as Record<string, unknown>
  if (enabled !== undefined && typeof enabled !== 'boolean') {
    throw new ValidationError('enabled 必须是布尔值')
  }
  if (directory !== undefined && typeof directory !== 'string') {
    throw new ValidationError('directory 必须是字符串')
  }
  if (confirmCloudDirectory !== undefined && typeof confirmCloudDirectory !== 'boolean') {
    throw new ValidationError('confirmCloudDirectory 必须是布尔值')
  }
}), asyncHandler(async (req, res) => {
  const config = await saveAutoBackupConfig(req.body)
  return success(res, config)
}))

// 回滚到指定回滚点：会用快照覆盖当前数据，不可逆，必须带确认值。
router.post('/rollback-points/:id/restore', validateRequest((req: Request) => {
  requireClearConfirm(req, ROLLBACK_CONFIRM.restore)
}), asyncHandler(async (req, res) => {
  const id = req.params.id
  if (!id) {
    throw new ValidationError('缺少回滚点 ID')
  }
  const result = await runExclusiveLongTask(() => restoreSnapshot(id))
  return success(res, result)
}))

// 删除回滚点
router.delete('/rollback-points/:id', asyncHandler(async (req, res) => {
  const id = req.params.id
  if (!id) {
    throw new ValidationError('缺少回滚点 ID')
  }
  await deleteSnapshot(id)
  return success(res, { message: '回滚点已删除' })
}))

export default router
