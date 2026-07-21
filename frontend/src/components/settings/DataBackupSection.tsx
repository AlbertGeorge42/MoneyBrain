import React, { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
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
import { queryKeys } from '../../queries'
import { useNotify } from '../../hooks/useNotify'
import { useIsMobile } from '../../hooks/useIsMobile'
import { downloadBlob, todayFilename } from '../../utils/download'

const allIncludes = ['transactions', 'config', 'budgets', 'snapshots'] as const

const includeLabels: Record<string, string> = {
  transactions: '交易记录',
  config: '配置信息',
  budgets: '预算配置',
  snapshots: '投资快照',
}

/** 共用的 Tag 列表组件，导出和导入复用 */
const IncludeTags: React.FC<{
  includes: string[]
  onRemove: (key: string) => void
  onReset: () => void
}> = ({ includes, onRemove, onReset }) => (
  <div className="backup-tags">
    <span className="backup-tags__label">包含：</span>
    {includes.map((key) => (
      <Tag key={key} closable onClose={() => onRemove(key)}>
        {includeLabels[key]}
      </Tag>
    ))}
    {includes.length < allIncludes.length && (
      <Button type="link" size="small" onClick={onReset}>重置</Button>
    )}
  </div>
)

const DataBackupSection: React.FC = () => {
  const { token } = theme.useToken()
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
      notify.success('导出成功，文件已开始下载')
    } catch (error) {
      hide()
      notify.error('导出失败，请重试')
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
      if (response.data.success && response.data.data) {
        setImportIncludes(response.data.data.includes)
      }
    } catch {
      setImportIncludes([...allIncludes])
    }
  }

  const handleImportBackup = async () => {
    if (!importFile) {
      notify.error('请选择文件')
      return
    }

    setImportingBackup(true)
    setImportBackupResult(null)

    try {
      const response = await dataApi.importBackup(importFile, { mode: importMode })
      const result = response.data

      if (!result.success || !result.data) {
        notify.error(result.error?.message || '导入失败')
        return
      }

      setImportBackupResult(result.data)

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.accounts.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.accountCategories.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.transactionCategories.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.transactions.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.budgets.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.analytics.assetTrend }),
      ])

      notify.success('备份导入成功')
    } catch {
      notify.error('备份导入失败，请检查文件格式')
    } finally {
      setImportingBackup(false)
    }
  }

  // ─── 导入结果 ───

  const renderImportResult = (result: ImportFullResult | null) => {
    if (!result) return null

    const labels: Record<string, string> = {
      transactions: '交易记录',
      accountCategories: '账户分类',
      accounts: '账户',
      transactionCategories: '收支分类',
      budgets: '预算',
      investmentSnapshots: '投资快照',
    }
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
          disabled={!importFile}
        >
          导入
        </Button>
      </div>

      {renderImportResult(importBackupResult)}
    </Card>
  )
}

export default DataBackupSection
