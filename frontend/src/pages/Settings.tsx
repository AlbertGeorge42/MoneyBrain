import React, { useEffect, useRef, useState } from 'react'
import {
  Button,
  Card,
  Modal,
  Space,
  Tag,
  message,
  Tabs,
  Alert,
  Divider,
} from 'antd'

import {
  BankOutlined,
  FileTextOutlined,
  TagsOutlined,
  SettingOutlined,
  SunOutlined,
  MoonOutlined,
  DesktopOutlined,
  DownloadOutlined,
  DeleteOutlined,
  ExclamationCircleOutlined,
  CheckCircleOutlined,
  CloudDownloadOutlined,
  InboxOutlined,
} from '@ant-design/icons'
import { PageHeader, RangeTimePickerField, type RangeTimePickerConfig, type RangeTimeValue } from '../components/common'
import { dataApi, type ImportConfigResult } from '../services/api'
import { useStore } from '../stores'
import { useTheme } from '../styles/ThemeContext'
import {
  colorDanger,
  colorMuted,
  colorNeutral,
  colorPrimary,
  colorSuccess,
  colorWarning,
  colorTransfer,
  colorInfo,
  fontWeightBold,
  radiusMd,
  spaceXs,
  spaceSm,
  spaceMd,
} from '../styles/tokens'
import { createRangePeriodPreset, createTrailingRangePreset } from '../utils/timePicker'

const exportTimePickerConfig: RangeTimePickerConfig = {
  label: '时间范围',
  allowedGranularities: ['day', 'month', 'year'],
  presets: {
    day: [
      createRangePeriodPreset('today', '今天', 'day'),
      createTrailingRangePreset('last-7-days', '近 7 天', 7, 'day'),
      createTrailingRangePreset('last-30-days', '近 30 天', 30, 'day'),
    ],
    month: [
      createRangePeriodPreset('current-month', '本月', 'month'),
      createRangePeriodPreset('previous-month', '上月', 'month', -1),
      createTrailingRangePreset('last-3-months', '近 3 个月', 3, 'month'),
    ],
    year: [
      createRangePeriodPreset('current-year', '今年', 'year'),
      createRangePeriodPreset('previous-year', '去年', 'year', -1),
    ],
  },
}

const themeOptions = [
  { value: 'light', label: '浅色', icon: <SunOutlined />, desc: '明亮的界面风格' },
  { value: 'dark', label: '深色', icon: <MoonOutlined />, desc: '护眼的暗色主题' },
  { value: 'system', label: '跟随系统', icon: <DesktopOutlined />, desc: '自动适配系统设置' },
] as const

const Settings: React.FC = () => {
  const { accounts, transactionCategories, accountCategories, pagination, fetchAccounts, fetchTransactionCategories, fetchTransactions, fetchBudgets, fetchAccountCategories } = useStore()
  const { mode, theme, setThemeMode } = useTheme()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const configFileInputRef = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState(false)
  const [importProgress, setImportProgress] = useState<{ imported: number; skipped: number } | null>(null)
  const [exportDateRange, setExportDateRange] = useState<RangeTimeValue | null>(null)
  const [exporting, setExporting] = useState(false)
  const [importDateRange, setImportDateRange] = useState<RangeTimeValue | null>(null)
  const [activeBackupTab, setActiveBackupTab] = useState('transactions')
  const [configExporting, setConfigExporting] = useState(false)
  const [configImporting, setConfigImporting] = useState(false)
  const [configImportResult, setConfigImportResult] = useState<ImportConfigResult | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)

  useEffect(() => {
    void Promise.all([
      fetchTransactions({ pageSize: 1 }),
      fetchAccounts(),
      fetchTransactionCategories(),
      fetchAccountCategories(),
    ])
  }, [fetchTransactions, fetchAccounts, fetchTransactionCategories, fetchAccountCategories])

  const refreshData = async () => {
    await Promise.all([
      fetchAccounts(),
      fetchTransactionCategories(),
      fetchTransactions(),
      fetchBudgets(),
      fetchAccountCategories(),
    ])
  }

  const handleExportCSV = async () => {
    setExporting(true)
    const hide = message.loading('正在导出数据，请稍候...', 0)

    try {
      const params: { startDate?: string; endDate?: string } = {}
      if (exportDateRange) {
        params.startDate = exportDateRange.start.toISOString()
        params.endDate = exportDateRange.end.toISOString()
      }

      const response = await dataApi.exportCsv(Object.keys(params).length ? params : undefined)
      const blob = response.data

      if (!blob || blob.size === 0) {
        throw new Error('导出的文件为空')
      }

      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `moneybrain-export-${new Date().toISOString().split('T')[0]}.csv`
      document.body.appendChild(anchor)
      anchor.click()
      document.body.removeChild(anchor)

      setTimeout(() => {
        URL.revokeObjectURL(url)
      }, 100)

      hide()
      message.success('数据导出成功，文件已开始下载')
    } catch (error) {
      hide()
      message.error('数据导出失败，请重试')
      console.error('Export CSV error:', error)
    } finally {
      setExporting(false)
    }
  }

  const handleImportCSV = async (file: File) => {
    setImporting(true)
    setImportProgress(null)

    try {
      const params: { startDate?: string; endDate?: string } = {}
      if (importDateRange) {
        params.startDate = importDateRange.start.toISOString()
        params.endDate = importDateRange.end.toISOString()
      }

      const response = await dataApi.importCsv(file, Object.keys(params).length ? params : undefined)
      const result = response.data

      if (!result.success || !result.data) {
        message.error(result.error?.message || '导入失败')
        return
      }

      setImportProgress({
        imported: result.data.imported,
        skipped: result.data.skipped,
      })
      message.success(`导入完成：成功 ${result.data.imported} 条，跳过 ${result.data.skipped} 条`)
      await refreshData()
    } catch {
      message.error('导入失败，请检查 CSV 格式')
    } finally {
      setImporting(false)
    }
  }

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      if (!file.name.endsWith('.csv')) {
        message.error('请选择 CSV 文件')
      } else {
        void handleImportCSV(file)
      }
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleExportConfig = async () => {
    setConfigExporting(true)
    const hide = message.loading('正在导出配置，请稍候...', 0)

    try {
      const response = await dataApi.exportConfig()
      const blob = response.data

      if (!blob || blob.size === 0) {
        throw new Error('导出的文件为空')
      }

      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `moneybrain-config-${new Date().toISOString().split('T')[0]}.json`
      document.body.appendChild(anchor)
      anchor.click()
      document.body.removeChild(anchor)

      setTimeout(() => {
        URL.revokeObjectURL(url)
      }, 100)

      hide()
      message.success('配置导出成功，文件已开始下载')
    } catch (error) {
      hide()
      message.error('配置导出失败，请重试')
      console.error('Export config error:', error)
    } finally {
      setConfigExporting(false)
    }
  }

  const handleImportConfig = async (file: File) => {
    if (!file.name.endsWith('.json')) {
      message.error('请选择 JSON 文件')
      return
    }
    setConfigImporting(true)
    setConfigImportResult(null)

    try {
      const response = await dataApi.importConfig(file)
      const result = response.data

      if (!result.success || !result.data) {
        message.error(result.error?.message || '导入失败')
        return
      }

      setConfigImportResult(result.data)
      message.success('配置导入完成')
      await refreshData()
    } catch {
      message.error('配置导入失败，请检查 JSON 格式')
    } finally {
      setConfigImporting(false)
    }
  }

  const handleConfigFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      void handleImportConfig(file)
    }
    if (configFileInputRef.current) {
      configFileInputRef.current.value = ''
    }
  }

  const handleDrop = (event: React.DragEvent<HTMLDivElement>, type: 'csv' | 'json') => {
    event.preventDefault()
    event.stopPropagation()
    setIsDragOver(false)
    const file = event.dataTransfer.files?.[0]
    if (!file) return
    if (type === 'csv') {
      if (!file.name.endsWith('.csv')) {
        message.error('请拖拽 CSV 文件')
        return
      }
      void handleImportCSV(file)
    } else {
      if (!file.name.endsWith('.json')) {
        message.error('请拖拽 JSON 文件')
        return
      }
      void handleImportConfig(file)
    }
  }

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
    setIsDragOver(true)
  }

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
    setIsDragOver(false)
  }

  const handleClearTransactions = async () => {
    try {
      await dataApi.clearTransactions()
      await Promise.all([fetchTransactions(), fetchBudgets()])
      message.success('交易数据已清空')
    } catch {
      message.error('清空交易数据失败')
    }
  }

  const handleClearData = async () => {
    try {
      await dataApi.clearAll()
      await refreshData()
      message.success('所有数据已清空')
    } catch {
      message.error('清空数据失败')
    }
  }

  const showClearTransactionsConfirm = () => {
    Modal.confirm({
      title: '确认清空交易数据',
      icon: <ExclamationCircleOutlined />,
      okText: '确认清空',
      okType: 'danger',
      cancelText: '取消',
      onOk: handleClearTransactions,
      content: (
        <div>
          <p style={{ color: colorDanger, fontWeight: fontWeightBold, marginBottom: spaceSm }}>
            这会永久删除所有交易记录与预算数据。
          </p>
          <p style={{ color: colorSuccess, marginBottom: spaceSm }}>账户和分类会保留。</p>
          <p style={{ color: colorNeutral, margin: 0 }}>建议先导出备份，再执行该操作。</p>
        </div>
      ),
    })
  }

  const showClearConfirm = () => {
    Modal.confirm({
      title: '确认清空全部数据',
      icon: <ExclamationCircleOutlined />,
      okText: '确认清空',
      okType: 'danger',
      cancelText: '取消',
      onOk: handleClearData,
      content: (
        <div>
          <p style={{ color: colorDanger, fontWeight: fontWeightBold, marginBottom: spaceSm }}>
            这会删除账户、分类、交易、预算和余额快照，且不可恢复。
          </p>
          <p style={{ color: colorNeutral, margin: 0 }}>只有在确认已完成备份后再继续。</p>
        </div>
      ),
    })
  }

  const tabItems = [
    {
      key: 'transactions',
      label: '交易记录',
      children: (
        <div className="settings-grid">
          <div>
            <h3 style={{ marginTop: 0, fontSize: 16, fontWeight: fontWeightBold }}>导出 CSV</h3>
            <p style={{ color: colorNeutral, fontSize: 13, marginBottom: spaceMd }}>
              导出为钱迹兼容格式，包含交易时间、分类、金额、账户等信息。
            </p>
            <Space wrap>
              <RangeTimePickerField
                value={exportDateRange}
                config={exportTimePickerConfig}
                onChange={setExportDateRange}
                placeholder="全部数据"
              />
              <Button icon={<DownloadOutlined />} onClick={handleExportCSV} loading={exporting} type="primary">
                导出 CSV
              </Button>
            </Space>
          </div>

          <Divider style={{ margin: `${spaceMd} 0`, borderColor: 'var(--mb-color-border)' }} />

          <div>
            <h3 style={{ marginTop: 0, fontSize: 16, fontWeight: fontWeightBold }}>导入 CSV</h3>
            <p style={{ color: colorNeutral, fontSize: 13, marginBottom: spaceMd }}>
              支持钱迹格式的 CSV 文件导入，自动创建不存在的账户和分类。
            </p>
            <Space wrap>
              <RangeTimePickerField
                value={importDateRange}
                config={exportTimePickerConfig}
                onChange={setImportDateRange}
                placeholder="全部数据"
              />
            </Space>
            <div
              className={`file-drop-zone ${isDragOver ? 'file-drop-zone--dragover' : ''}`}
              style={{ marginTop: spaceMd }}
              onClick={() => fileInputRef.current?.click()}
              onDrop={(e) => handleDrop(e, 'csv')}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
            >
              <input ref={fileInputRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={handleFileChange} />
              <InboxOutlined style={{ fontSize: 32, color: colorPrimary, marginBottom: spaceSm }} />
              <p style={{ margin: 0, fontWeight: fontWeightBold }}>点击或拖拽 CSV 文件到此处</p>
              <p style={{ margin: 0, color: colorMuted, fontSize: 12 }}>{importing ? '正在导入...' : '支持钱迹格式的交易记录'}</p>
            </div>
            {importProgress ? (
              <div
                style={{
                  marginTop: spaceSm,
                  padding: 12,
                  borderRadius: radiusMd,
                  border: `1px solid ${colorPrimary}`,
                  background: 'rgba(30, 99, 218, 0.06)',
                }}
              >
                <p style={{ margin: 0 }}>成功导入：{importProgress.imported} 条</p>
                <p style={{ margin: 0, color: colorMuted }}>已跳过：{importProgress.skipped} 条</p>
              </div>
            ) : null}
          </div>
        </div>
      ),
    },
    {
      key: 'config',
      label: '配置信息',
      children: (
        <div className="settings-grid">
          <div>
            <h3 style={{ marginTop: 0, fontSize: 16, fontWeight: fontWeightBold }}>导出配置</h3>
            <p style={{ color: colorNeutral, fontSize: 13, marginBottom: spaceMd }}>
              导出账户、账户分类、收支分类等配置信息，以 JSON 格式保存。
            </p>
            <Button icon={<CloudDownloadOutlined />} onClick={handleExportConfig} loading={configExporting} type="primary">
              导出配置
            </Button>
          </div>

          <Divider style={{ margin: `${spaceMd} 0`, borderColor: 'var(--mb-color-border)' }} />

          <div>
            <h3 style={{ marginTop: 0, fontSize: 16, fontWeight: fontWeightBold }}>导入配置</h3>
            <p style={{ color: colorNeutral, fontSize: 13, marginBottom: spaceMd }}>
              从 JSON 文件恢复账户、分类等配置信息。存在则更新，不存在则新增。
            </p>
            <div
              className={`file-drop-zone ${isDragOver ? 'file-drop-zone--dragover' : ''}`}
              onClick={() => configFileInputRef.current?.click()}
              onDrop={(e) => handleDrop(e, 'json')}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
            >
              <input ref={configFileInputRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleConfigFileChange} />
              <InboxOutlined style={{ fontSize: 32, color: colorPrimary, marginBottom: spaceSm }} />
              <p style={{ margin: 0, fontWeight: fontWeightBold }}>点击或拖拽 JSON 文件到此处</p>
              <p style={{ margin: 0, color: colorMuted, fontSize: 12 }}>
                {configImporting ? '正在导入...' : '支持导入账户、分类等配置信息'}
              </p>
            </div>
            {configImportResult ? (
              <div
                style={{
                  marginTop: spaceSm,
                  padding: 12,
                  borderRadius: radiusMd,
                  border: `1px solid ${colorSuccess}`,
                  background: 'rgba(82, 196, 26, 0.06)',
                }}
              >
                <p style={{ margin: 0, fontWeight: fontWeightBold }}>导入结果</p>
                <div style={{ marginTop: spaceSm, display: 'grid', gap: spaceXs, fontSize: 13 }}>
                  <p style={{ margin: 0 }}>账户分类：新增 {configImportResult.imported.accountCategories} / 更新 {configImportResult.updated.accountCategories} / 跳过 {configImportResult.skipped.accountCategories}</p>
                  <p style={{ margin: 0 }}>账户：新增 {configImportResult.imported.accounts} / 更新 {configImportResult.updated.accounts} / 跳过 {configImportResult.skipped.accounts}</p>
                  <p style={{ margin: 0 }}>收支分类：新增 {configImportResult.imported.transactionCategories} / 更新 {configImportResult.updated.transactionCategories} / 跳过 {configImportResult.skipped.transactionCategories}</p>
                </div>
                {configImportResult.errors.length > 0 && (
                  <div style={{ marginTop: spaceSm }}>
                    <p style={{ margin: 0, color: colorDanger }}>错误 ({configImportResult.errors.length} 条)：</p>
                    {configImportResult.errors.slice(0, 3).map((err, idx) => (
                      <p key={idx} style={{ margin: 0, color: colorMuted, fontSize: 12 }}>{err}</p>
                    ))}
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>
      ),
    },
  ]

  return (
    <>
      <PageHeader
        eyebrow="Settings"
        title="设置与数据"
        description="管理主题、备份和高风险操作。"
      />

      <div className="kpi-grid settings-kpi-grid">
        <Card className="surface-card metric-card">
          <div className="metric-card__header">
            <BankOutlined style={{ fontSize: 18, color: colorPrimary }} />
            <span className="metric-card__label">账户</span>
          </div>
          <div className="metric-card__value">{accounts.length}</div>
        </Card>
        <Card className="surface-card metric-card">
          <div className="metric-card__header">
            <FileTextOutlined style={{ fontSize: 20, color: colorInfo }} />
            <span className="metric-card__label">交易记录</span>
          </div>
          <div className="metric-card__value">{pagination.total}</div>
        </Card>
        <Card className="surface-card metric-card">
          <div className="metric-card__header">
            <TagsOutlined style={{ fontSize: 20, color: colorSuccess }} />
            <span className="metric-card__label">收支分类</span>
          </div>
          <div className="metric-card__value">{transactionCategories.length}</div>
        </Card>
        <Card className="surface-card metric-card">
          <div className="metric-card__header">
            <SettingOutlined style={{ fontSize: 20, color: colorPrimary }} />
            <span className="metric-card__label">账户分类</span>
          </div>
          <div className="metric-card__value">{accountCategories.length}</div>
        </Card>
      </div>

      <Card className="surface-card" title="外观主题">
        <div className="theme-options-grid">
          {themeOptions.map((option) => (
            <div
              key={option.value}
              className={`theme-option-card ${mode === option.value ? 'theme-option-card--active' : ''}`}
              onClick={() => setThemeMode(option.value)}
            >
              <div style={{ fontSize: 24, marginBottom: 8, color: colorPrimary }}>{option.icon}</div>
              <div style={{ fontWeight: fontWeightBold, marginBottom: 4 }}>{option.label}</div>
              <div style={{ fontSize: 12, color: colorMuted }}>{option.desc}</div>
            </div>
          ))}
        </div>
        <Tag style={{ marginTop: spaceMd, color: theme === 'dark' ? colorTransfer : undefined, borderColor: theme === 'dark' ? colorTransfer : undefined, backgroundColor: 'transparent' }} icon={<CheckCircleOutlined />} variant="filled">
          当前生效：{mode === 'system' ? `跟随系统 / ${theme === 'dark' ? '深色' : '浅色'}` : theme === 'dark' ? '深色' : '浅色'}
        </Tag>
      </Card>

      <Card className="surface-card" title="数据备份">
        <Tabs activeKey={activeBackupTab} onChange={setActiveBackupTab} items={tabItems} />
      </Card>

      <Card className="surface-card danger-zone" title="危险操作">
        <Alert
          message="执行前建议先导出配置备份"
          type="warning"
          showIcon
          style={{ marginBottom: spaceMd }}
        />
        <div className="section-grid">
          <div>
            <h3 style={{ color: colorWarning, marginTop: 0 }}>清空交易数据</h3>
            <p style={{ color: colorNeutral, fontSize: 13, marginBottom: spaceMd }}>
              永久删除所有交易记录与预算数据，账户和分类会保留。
            </p>
            <Button ghost icon={<DeleteOutlined />} onClick={showClearTransactionsConfirm} style={{ borderColor: colorWarning, color: colorWarning }}>
              清空交易数据
            </Button>
          </div>

          <div>
            <h3 style={{ color: colorDanger, marginTop: 0 }}>清空全部数据</h3>
            <p style={{ color: colorNeutral, fontSize: 13, marginBottom: spaceMd }}>
              删除账户、分类、交易、预算等所有数据，且不可恢复。
            </p>
            <Button danger icon={<DeleteOutlined />} onClick={showClearConfirm}  style={{ borderColor: colorDanger, color: colorDanger }}>
              清空全部数据
            </Button>
          </div>
        </div>
      </Card>

      <Card className="surface-card">
        <div style={{ display: 'flex', alignItems: 'center', gap: spaceMd, flexWrap: 'wrap' }}>
          <div
            style={{
              width: 42,
              height: 42,
              borderRadius: 14,
              background: 'linear-gradient(135deg, var(--mb-color-primary), #3b86ff 70%)',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 18,
              fontWeight: 700,
              flexShrink: 0,
            }}
          >
            M
          </div>
          <div>
            <p style={{ margin: 0, fontWeight: fontWeightBold }}>MoneyBrain 1.0.0</p>
            <p style={{ color: colorNeutral, margin: 0, fontSize: 13 }}>
              一款面向个人资产管理的记账应用，数据存储在本地。
            </p>
          </div>
        </div>
      </Card>
    </>
  )
}

export default Settings
