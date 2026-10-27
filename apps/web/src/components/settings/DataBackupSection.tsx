import React, { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  App,
  Alert,
  Button,
  Card,
  Divider,
  Radio,
  Upload,
  Tag,
  theme,
} from 'antd'
import { DownloadOutlined, InboxOutlined } from '@ant-design/icons'
import { dataApi, type ImportFullResult } from '../../services/api'
import { unwrapApiData } from '../../services/apiResult'
import { getApiErrorMessage } from '../../services/apiError'
import { invalidateLedger } from '../../queries/ledger'
import { useNotify } from '../../hooks/useNotify'
import { useIsMobile } from '../../hooks/useIsMobile'
import { downloadBlob, todayFilename } from '../../utils/download'
import { STORAGE_KEYS } from '../../utils/storageKeys'
import { BACKUP_DATA_TYPES, BACKUP_DATA_TYPE_LABELS, IMPORT_ENTRY_LABELS, type BackupDataType } from '@contracts/constants'
import dayjs from 'dayjs'

const allIncludes = BACKUP_DATA_TYPES

/** 共用的 Tag 列表组件，导出和导入复用 */
const IncludeTags: React.FC<{
  includes: string[]
  onRemove: (key: string) => void
  onReset: () => void
}> = ({ includes, onRemove, onReset }) => (
  <div className="backup-tags">
    <span className="backup-tags__label">包含：</span>
    {includes.map((key) => (
      <Tag variant="outlined" key={key} closable onClose={() => onRemove(key)}>
        {BACKUP_DATA_TYPE_LABELS[key as BackupDataType] ?? key}
      </Tag>
    ))}
    {includes.length < allIncludes.length && (
      <Button type="link" size="small" onClick={onReset}>重置</Button>
    )}
  </div>
)

const DataBackupSection: React.FC = () => {
  const { token } = theme.useToken()
  const { modal } = App.useApp()
  const notify = useNotify()
  const queryClient = useQueryClient()
  const isMobile = useIsMobile()

  // ─── 导出状态 ───
  const [exporting, setExporting] = useState(false)
  const [exportIncludes, setExportIncludes] = useState<string[]>([...allIncludes])

  // ─── 导入状态 ───
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importIncludes, setImportIncludes] = useState<string[]>([...allIncludes])
  const [importMode, setImportMode] = useState<'merge' | 'overwrite'>('merge')
  const [importingBackup, setImportingBackup] = useState(false)
  const [importBackupResult, setImportBackupResult] = useState<ImportFullResult | null>(null)

  // 上次备份时间（存在本机浏览器里；换设备后需要重新导出）
  const [lastBackupAt, setLastBackupAt] = useState<string | null>(() => {
    try {
      return localStorage.getItem(STORAGE_KEYS.lastBackupAt)
    } catch {
      return null
    }
  })
  const backupAgeDays = lastBackupAt
    ? Math.floor((Date.now() - new Date(lastBackupAt).getTime()) / 86_400_000)
    : null
  const backupOverdue = backupAgeDays === null || backupAgeDays > 7

  // ─── 导出 ───

  const handleExport = async () => {
    if (exportIncludes.length === 0) {
      notify.error('请至少选择一项数据')
      return
    }

    setExporting(true)
    const hide = notify.loading('正在导出，请稍候...', 0)

    try {
      let buffer: Blob | ArrayBuffer
      let prefix: string
      let ext: string

      if (exportIncludes.length === allIncludes.length) {
        const response = await dataApi.exportFull()
        buffer = response.data
        prefix = 'moneybrain-full-backup'
        ext = 'zip'
      } else {
        const response = await dataApi.exportCustom({ includes: exportIncludes })
        buffer = response.data
        const contentType = (response.headers['content-type'] as string) || ''
        ext = contentType.includes('zip') ? 'zip'
          : contentType.includes('csv') ? 'csv'
          : 'json'
        prefix = `moneybrain-${exportIncludes[0]}`
      }

      await downloadBlob(buffer as Blob, todayFilename(prefix, ext))
      hide()
      // 记录本次备份时间，用于「该备份了」的提醒
      try {
        localStorage.setItem(STORAGE_KEYS.lastBackupAt, new Date().toISOString())
        setLastBackupAt(new Date().toISOString())
      } catch { /* 隐私模式下写入失败可忽略 */ }
      notify.success('导出成功，文件已开始下载')
    } catch (error) {
      hide()
      notify.error(getApiErrorMessage(error, '导出失败，请重试'))
      console.error('Export error:', error)
    } finally {
      setExporting(false)
    }
  }

  // ─── 导入 ───

  const handleFileSelect = async (file: File) => {
    setImportFile(file)
    setImportBackupResult(null)

    try {
      const response = await dataApi.detectFileIncludes(file)
      const detected = unwrapApiData(response)
      setImportIncludes(detected.includes)
    } catch {
      setImportIncludes([...allIncludes])
    }
  }

  const runImportBackup = async () => {
    if (!importFile) return

    setImportingBackup(true)
    setImportBackupResult(null)

    try {
      const response = await dataApi.importBackup(importFile, {
        mode: importMode,
        includes: importIncludes,
      })
      const result = unwrapApiData(response)

      setImportBackupResult(result)
      await invalidateLedger(queryClient)
      notify.success('备份导入成功')
    } catch (error) {
      notify.error(getApiErrorMessage(error, '备份导入失败，请检查文件格式'))
    } finally {
      setImportingBackup(false)
    }
  }

  const handleImportBackup = () => {
    if (!importFile) {
      notify.error('请选择文件')
      return
    }
    if (importIncludes.length === 0) {
      notify.error('请至少选择一项导入数据')
      return
    }

    if (importMode === 'merge') {
      void runImportBackup()
      return
    }

    const scope = importIncludes.map((key) => BACKUP_DATA_TYPE_LABELS[key as BackupDataType] ?? key).join('、')
    modal.confirm({
      title: '确认覆盖导入？',
      content: `将先清空“${scope}”范围内的现有数据，再导入文件内容。此操作不可撤销，建议先导出一份备份。`,
      okText: '覆盖导入',
      okType: 'danger',
      cancelText: '取消',
      onOk: runImportBackup,
    })
  }

  // ─── 导入结果 ───

  const renderImportResult = (result: ImportFullResult | null) => {
    if (!result) return null

    const labels: Record<string, string> = IMPORT_ENTRY_LABELS
    const rows: string[] = [
      ...Object.entries(result.imported)
        .filter(([, count]) => count > 0)
        .map(([key, count]) => `${labels[key] || key}：新增 ${count} 项`),
      ...Object.entries(result.updated)
        .filter(([, count]) => count > 0)
        .map(([key, count]) => `${labels[key] || key}：更新 ${count} 项`),
    ]

    return (
      <div className="import-result">
        <p className="import-result__title">导入结果</p>
        <div className="import-result__rows">
          {rows.map((text, idx) => <p key={idx}>{text}</p>)}
        </div>
        {result.errors.length > 0 && (
          <div className="import-result__errors">
            <p style={{ color: 'var(--mb-color-danger)' }}>错误 ({result.errors.length} 条)：</p>
            {result.errors.slice(0, 3).map((err, idx) => <p key={idx}>{err}</p>)}
          </div>
        )}
      </div>
    )
  }

  return (
    <Card className="surface-card" title="数据备份">
      {/* ── 导出 ── */}
      <h3 className="settings-section-title">数据导出</h3>
      <p className="settings-desc">选择需要导出的数据，点击导出按钮下载备份文件</p>

      <IncludeTags
        includes={exportIncludes}
        onRemove={(key) => setExportIncludes(prev => prev.filter(v => v !== key))}
        onReset={() => setExportIncludes([...allIncludes])}
      />

      <Button
        type="primary"
        icon={<DownloadOutlined />}
        onClick={handleExport}
        loading={exporting}
        style={{ marginTop: token.paddingSM }}
      >
        导出
      </Button>

      <div className="backup-status">
        {lastBackupAt ? (
          <span>
            上次备份：{dayjs(lastBackupAt).format('YYYY-MM-DD HH:mm')}
            {backupAgeDays !== null && backupAgeDays > 0 ? `（${backupAgeDays} 天前）` : ''}
          </span>
        ) : (
          <span>还没有备份过，建议先导出一份。</span>
        )}
        {backupOverdue && (
          <Alert
            type="warning"
            showIcon
            message="备份已超过 7 天，建议重新导出一次。"
            style={{ marginTop: token.paddingSM }}
          />
        )}
      </div>

      <Divider className="settings-divider" />

      {/* ── 导入 ── */}
      <h3 className="settings-section-title">数据导入</h3>
      <p className="settings-desc">选择备份文件、导入范围和模式</p>

      <IncludeTags
        includes={importIncludes}
        onRemove={(key) => setImportIncludes(prev => prev.filter(v => v !== key))}
        onReset={() => setImportIncludes([...allIncludes])}
      />

      <div className="backup-mode-row">
        <span className="backup-tags__label">模式：</span>
        <Radio.Group
          value={importMode}
          onChange={(e) => setImportMode(e.target.value)}
        >
          <Radio value="merge">合并</Radio>
          <Radio value="overwrite">覆盖</Radio>
        </Radio.Group>
      </div>

      <div className="backup-action-row" style={{ marginTop: token.paddingSM }}>
        {isMobile ? (
          <Upload
            accept=".zip,.csv,.json"
            showUploadList={false}
            maxCount={1}
            beforeUpload={(file) => { handleFileSelect(file); return false }}
          >
            <Button icon={<InboxOutlined />}>
              {importFile ? importFile.name : '选择文件'}
            </Button>
          </Upload>
        ) : (
          <Upload
            accept=".zip,.csv,.json"
            showUploadList={false}
            maxCount={1}
            beforeUpload={(file) => { handleFileSelect(file); return false }}
          >
            <Button icon={<InboxOutlined />}>
              {importFile ? importFile.name : '选择备份文件'}
            </Button>
          </Upload>
        )}
        <Button
          type="primary"
          onClick={handleImportBackup}
          loading={importingBackup}
          disabled={!importFile || importIncludes.length === 0}
        >
          导入
        </Button>
      </div>

      {renderImportResult(importBackupResult)}
    </Card>
  )
}

export default DataBackupSection
