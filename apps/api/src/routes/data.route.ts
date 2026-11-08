import { Router, type Request } from 'express'
import { asyncHandler, success, validateRequest, ValidationError } from '../common/index.js'
import { requireClearConfirm } from '../common/validators.js'
import { CLEAR_CONFIRM, ROLLBACK_CONFIRM } from '../../../../packages/contracts/constants.js'
import multer from 'multer'
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
import { normalizeBackupInput } from '../services/sync/container.service.js'
import { listImportBatches, rollbackImportBatch } from '../services/import-batch.service.js'
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

// 恢复码只做类型检查；格式与解密失败由容器服务统一报错
function parseRecoveryCode(raw: unknown): string | undefined {
  if (raw === undefined || raw === '') return undefined
  if (typeof raw !== 'string') throw new ValidationError('恢复码格式错误')
  return raw
}

// 文件内容识别（加密容器会先解密成 ZIP 再识别）
router.post('/detect-file', upload.single('file'), validateRequest((req: Request) => {
  if (!req.file) {
    throw new ValidationError('请上传文件')
  }
}), asyncHandler(async (req, res) => {
  const input = await normalizeBackupInput(
    req.file!.buffer,
    req.file!.originalname,
    { recoveryCode: parseRecoveryCode(req.body?.recoveryCode) },
  )
  const fileType = detectFileType(input.filename)
  const includes = await detectFileIncludes(input.buffer, fileType)
  return success(res, { includes, encrypted: input.encrypted })
}))

// 完整备份导出（加密容器；扩展名 .mbx）
router.get('/export-full', asyncHandler(async (_req, res) => {
  const buffer = await runExclusiveLongTask(() => exportFullBackup())
  res.setHeader('Content-Type', 'application/octet-stream')
  res.setHeader('Content-Disposition', `attachment; filename=${generateBackupFilename()}`)
  res.send(buffer)
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
  const options = { recoveryCode: parseRecoveryCode(req.body.recoveryCode) }

  // 覆盖导入会先清空数据，先留回滚点再执行——出错还有退路。
  // 长任务：导入进行中不让自动备份抢 IO
  if (mode === 'overwrite') {
    const { result, rollbackPointId } = await runExclusiveLongTask(() =>
      importBackupWithRollback(req.file!.buffer, req.file!.originalname, includes, options)
    )
    return success(res, { ...result, rollbackPointId })
  }

  const result = await runExclusiveLongTask(() =>
    importBackup(req.file!.buffer, req.file!.originalname, mode, includes, options)
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
  const options = { recoveryCode: parseRecoveryCode(req.body.recoveryCode) }

  const result = await runExclusiveLongTask(() =>
    previewImport(req.file!.buffer, req.file!.originalname, mode, includes, options)
  )
  const willOverwrite = mode === 'overwrite'
    ? await resolveOverwriteScope(req.file!.buffer, req.file!.originalname, includes, options)
    : []
  return success(res, { result, willOverwrite })
}))

// 回滚点列表
router.get('/rollback-points', asyncHandler(async (_req, res) => {
  const points = await listSnapshotPoints()
  return success(res, points)
}))

// ─── 导入批次（按 importId 精确回滚）───

/** 最近的导入批次：设置页展示「这批导入了多少笔」与可撤销批次。 */
router.get('/import-batches', asyncHandler(async (req, res) => {
  const rawLimit = Number(req.query.limit ?? 10)
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.trunc(rawLimit), 1), 50) : 10
  const batches = await listImportBatches(limit)
  return success(res, batches)
}))

/**
 * 撤销一次导入：只删该批新建的行，导入前已有的数据不动。
 * 不可逆，按破坏性接口的规矩要求带确认值。
 */
router.post('/import-batches/:id/rollback', validateRequest((req: Request) => {
  requireClearConfirm(req, ROLLBACK_CONFIRM.import)
}), asyncHandler(async (req, res) => {
  const id = req.params.id
  if (!id) {
    throw new ValidationError('缺少导入批次 ID')
  }
  const result = await runExclusiveLongTask(() => rollbackImportBatch(id))
  return success(res, result)
}))

// ─── 自动定时备份（B3）───
// 备份执行时刻仍由内部策略决定（间隔 + 空闲窗口，见 service 头注释）；
// 用户可设置开关、目录、备份间隔（小时）与保留份数。
// F5 已落地：导出的是加密容器，云同步目录限制已放开。
router.get('/auto-backup', asyncHandler(async (_req, res) => {
  const config = await getAutoBackupConfig()
  return success(res, {
    enabled: config.enabled,
    directory: config.directory,
    defaultDirectory: config.defaultDirectory,
    intervalHours: config.intervalHours,
    keepCount: config.keepCount,
    lastRunAt: config.lastRunAt,
    lastRunError: config.lastRunError,
    // 预计下次窗口 = 上次成功 + 配置的间隔；从未成功过则首次空闲窗口即可
    nextWindowAt: config.lastRunAt
      ? new Date(new Date(config.lastRunAt).getTime() + config.intervalHours * 60 * 60_000).toISOString()
      : null,
    backupCount: countAutoBackups(config.directory),
  })
}))

router.put('/auto-backup', validateRequest((req: Request) => {
  const { enabled, directory, intervalHours, keepCount } = req.body as Record<string, unknown>
  if (enabled !== undefined && typeof enabled !== 'boolean') {
    throw new ValidationError('enabled 必须是布尔值')
  }
  if (directory !== undefined && typeof directory !== 'string') {
    throw new ValidationError('directory 必须是字符串')
  }
  // 范围校验在 service 统一做（直接调用 service 的测试也覆盖）；这里只挡类型错误。
  if (intervalHours !== undefined && typeof intervalHours !== 'number') {
    throw new ValidationError('intervalHours 必须是正整数小时')
  }
  if (keepCount !== undefined && typeof keepCount !== 'number') {
    throw new ValidationError('keepCount 必须是正整数')
  }
}), asyncHandler(async (req, res) => {
  const { enabled, directory, intervalHours, keepCount } = req.body as {
    enabled?: boolean
    directory?: string
    intervalHours?: number
    keepCount?: number
  }
  const config = await saveAutoBackupConfig({ enabled, directory, intervalHours, keepCount })
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
