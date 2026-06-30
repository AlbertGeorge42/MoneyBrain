import React, { useState } from 'react'
import {
  Button,
  Card,
  Modal,
  Space,
  Tag,
  Alert,
  Divider,
  theme,
  Checkbox,
  Radio,
  Upload,
  Collapse,
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
  InboxOutlined,
} from '@ant-design/icons'
import { PageHeader } from '../components/common'
import { dataApi, type ImportFullResult } from '../services/api'
import {
  useAccounts,
  useTransactionCategories,
  useAccountCategories,
  useTransactions,
  useClearTransactions,
  useClearAll,
} from '../queries'
import { useNotify } from '../hooks/useNotify'
import { useTheme } from '../styles/ThemeContext'
import { downloadBlob, todayFilename } from '../utils/download'

const themeOptions = [
  { value: 'light', label: '浅色', icon: <SunOutlined />, desc: '明亮的界面风格' },
  { value: 'dark', label: '深色', icon: <MoonOutlined />, desc: '护眼的暗色主题' },
  { value: 'system', label: '跟随系统', icon: <DesktopOutlined />, desc: '自动适配系统设置' },
] as const

const Settings: React.FC = () => {
  const { token } = theme.useToken()
  const { mode, theme: currentTheme, setThemeMode } = useTheme()
  const notify = useNotify()

  const { data: accounts = [] } = useAccounts()
  const { data: transactionCategories = [] } = useTransactionCategories()
  const { data: accountCategories = [] } = useAccountCategories()
  const { data: transactionsData } = useTransactions({ pageSize: 1 })
  const clearTransactionsMutation = useClearTransactions()
  const clearAllMutation = useClearAll()

  const paginationTotal = transactionsData?.total ?? 0

  const colorDanger = token.colorError
  const colorTextMuted = token.colorTextTertiary
  const colorActionPrimary = token.colorPrimary
  const colorSuccess = token.colorSuccess
  const colorWarning = token.colorWarning
  const fontWeightBold = 700
  const spaceCardPadding = `${token.padding}px`

  // 导出状态
  const [exporting, setExporting] = useState(false)

  // 自定义导出选项
  const [exportIncludes, setExportIncludes] = useState<string[]>(['transactions', 'config', 'budgets', 'snapshots'])

  // 导入备份状态
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importIncludes, setImportIncludes] = useState<string[]>([])
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

      if (exportIncludes.length === 4) {
        // 全部勾选 → 完整备份
        const response = await dataApi.exportFull()
        buffer = response.data
        prefix = 'moneybrain-full-backup'
        ext = 'zip'
      } else {
        // 自定义导出
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

  const handleExportIncludesChange = (checkedValue: string) => {
    setExportIncludes(prev =>
      prev.includes(checkedValue)
        ? prev.filter(v => v !== checkedValue)
        : [...prev, checkedValue]
    )
  }

  const handleQuickSelect = (type: 'all' | 'config' | 'business' | 'clear') => {
    if (type === 'all') {
      setExportIncludes(['transactions', 'config', 'budgets', 'snapshots'])
    } else if (type === 'config') {
      setExportIncludes(['config', 'budgets'])
    } else if (type === 'business') {
      setExportIncludes(['transactions', 'snapshots'])
    } else {
      setExportIncludes([])
    }
  }

  // ─── 导入备份 ───

  const handleFileSelect = async (file: File) => {
    setImportFile(file)
    setImportBackupResult(null)

    // 自动识别文件内容
    try {
      const response = await dataApi.detectFileIncludes(file)
      const result = response.data

      if (result.success && result.data) {
        setImportIncludes(result.data.includes)
      }
    } catch {
      // 如果识别失败，默认全选
      setImportIncludes(['transactions', 'config', 'budgets', 'snapshots'])
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
      notify.success('备份导入成功')
    } catch {
      notify.error('备份导入失败，请检查文件格式')
    } finally {
      setImportingBackup(false)
    }
  }

  const handleImportIncludesChange = (checkedValue: string) => {
    setImportIncludes(prev =>
      prev.includes(checkedValue)
        ? prev.filter(v => v !== checkedValue)
        : [...prev, checkedValue]
    )
  }

  // ─── 危险操作 ───

  const handleClearTransactions = async () => {
    try {
      await clearTransactionsMutation.mutateAsync()
      notify.success('交易数据已清空')
    } catch {
      notify.error('清空交易数据失败')
    }
  }

  const handleClearData = async () => {
    try {
      await clearAllMutation.mutateAsync()
      notify.success('所有数据已清空')
    } catch {
      notify.error('清空数据失败')
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
          <p style={{ color: colorDanger, fontWeight: fontWeightBold, marginBottom: '8px' }}>
            这会永久删除所有交易记录与预算数据。
          </p>
          <p style={{ color: colorSuccess, marginBottom: '8px' }}>账户和分类会保留。</p>
          <p style={{ color: colorTextMuted, margin: 0 }}>建议先导出备份，再执行该操作。</p>
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
          <p style={{ color: colorDanger, fontWeight: fontWeightBold, marginBottom: '8px' }}>
            这会删除账户、分类、交易、预算和余额快照，且不可恢复。
          </p>
          <p style={{ color: colorTextMuted, margin: 0 }}>只有在确认已完成备份后再继续。</p>
        </div>
      ),
    })
  }

  // ─── 渲染导入结果 ───

  const renderImportResult = (result: ImportFullResult | null) => {
    if (!result) return null

    return (
      <div
        style={{
          marginTop: '8px',
          padding: 12,
          borderRadius: `${token.borderRadius}px`,
          border: `1px solid ${colorSuccess}`,
          background: 'rgba(82, 196, 26, 0.06)',
        }}
      >
        <p style={{ margin: 0, fontWeight: fontWeightBold }}>导入结果</p>
        <div style={{ marginTop: '8px', display: 'grid', gap: '4px', fontSize: `${token.fontSize}px` }}>
          {result.imported.transactions > 0 && (
            <p style={{ margin: 0 }}>交易记录：新增 {result.imported.transactions} 条</p>
          )}
          {result.imported.accountCategories > 0 && (
            <p style={{ margin: 0 }}>账户分类：新增 {result.imported.accountCategories} 项</p>
          )}
          {result.imported.accounts > 0 && (
            <p style={{ margin: 0 }}>账户：新增 {result.imported.accounts} 项</p>
          )}
          {result.imported.transactionCategories > 0 && (
            <p style={{ margin: 0 }}>收支分类：新增 {result.imported.transactionCategories} 项</p>
          )}
          {result.imported.budgets > 0 && (
            <p style={{ margin: 0 }}>预算：新增 {result.imported.budgets} 项</p>
          )}
          {result.imported.investmentSnapshots > 0 && (
            <p style={{ margin: 0 }}>投资快照：新增 {result.imported.investmentSnapshots} 条</p>
          )}
          {result.updated.accountCategories > 0 && (
            <p style={{ margin: 0 }}>账户分类：更新 {result.updated.accountCategories} 项</p>
          )}
          {result.updated.accounts > 0 && (
            <p style={{ margin: 0 }}>账户：更新 {result.updated.accounts} 项</p>
          )}
          {result.updated.transactionCategories > 0 && (
            <p style={{ margin: 0 }}>收支分类：更新 {result.updated.transactionCategories} 项</p>
          )}
          {result.updated.budgets > 0 && (
            <p style={{ margin: 0 }}>预算：更新 {result.updated.budgets} 项</p>
          )}
          {result.updated.investmentSnapshots > 0 && (
            <p style={{ margin: 0 }}>投资快照：更新 {result.updated.investmentSnapshots} 条</p>
          )}
        </div>
        {result.errors.length > 0 && (
          <div style={{ marginTop: '8px' }}>
            <p style={{ margin: 0, color: colorDanger }}>错误 ({result.errors.length} 条)：</p>
            {result.errors.slice(0, 3).map((err, idx) => (
              <p key={idx} style={{ margin: 0, color: colorTextMuted, fontSize: `${token.fontSizeSM}px` }}>{err}</p>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <>
      <PageHeader
        eyebrow="Settings"
        title="设置与数据"
        description="管理主题、备份和高风险操作。"
      />

      {/* 数据统计卡片 */}
      <div className="kpi-grid settings-kpi-grid">
        <Card className="surface-card metric-card">
          <div className="metric-card__header">
            <BankOutlined style={{ fontSize: 18, color: colorActionPrimary }} />
            <span className="metric-card__label">账户</span>
          </div>
          <div className="metric-card__value">{accounts.length}</div>
        </Card>
        <Card className="surface-card metric-card">
          <div className="metric-card__header">
            <FileTextOutlined style={{ fontSize: 20, color: colorActionPrimary }} />
            <span className="metric-card__label">交易记录</span>
          </div>
          <div className="metric-card__value">{paginationTotal}</div>
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
            <SettingOutlined style={{ fontSize: 20, color: colorActionPrimary }} />
            <span className="metric-card__label">账户分类</span>
          </div>
          <div className="metric-card__value">{accountCategories.length}</div>
        </Card>
      </div>

      {/* 外观主题 */}
      <Card className="surface-card" title="外观主题">
        <div className="theme-options-grid">
          {themeOptions.map((option) => (
            <div
              key={option.value}
              className={`theme-option-card ${mode === option.value ? 'theme-option-card--active' : ''}`}
              onClick={() => setThemeMode(option.value)}
            >
              <div style={{ fontSize: 24, marginBottom: 8, color: colorActionPrimary }}>{option.icon}</div>
              <div style={{ fontWeight: fontWeightBold, marginBottom: 4 }}>{option.label}</div>
              <div style={{ fontSize: `${token.fontSizeSM}px`, color: colorTextMuted }}>{option.desc}</div>
            </div>
          ))}
        </div>
        <Tag style={{ marginTop: spaceCardPadding, color: currentTheme === 'dark' ? 'var(--mb-color-transfer)' : undefined, borderColor: currentTheme === 'dark' ? 'var(--mb-color-transfer)' : undefined, backgroundColor: 'transparent' }} icon={<CheckCircleOutlined />} variant="filled">
          当前生效：{mode === 'system' ? `跟随系统 / ${currentTheme === 'dark' ? '深色' : '浅色'}` : currentTheme === 'dark' ? '深色' : '浅色'}
        </Tag>
      </Card>

      {/* 数据备份 */}
      <Card className="surface-card" title="数据备份">
        {/* 数据导出 分区 */}
        <div style={{ marginBottom: '24px' }}>
          <h3 style={{ marginTop: 0, fontSize: `${token.fontSizeLG}px`, fontWeight: fontWeightBold }}>数据导出</h3>
          <p style={{ color: colorTextMuted, fontSize: `${token.fontSize}px`, marginBottom: spaceCardPadding }}>
            默认导出全部数据（交易、配置、预算、投资快照）；可展开下方"高级选项"自定义导出内容
          </p>

          <Collapse
            ghost
            items={[
              {
                key: 'advanced',
                label: (
                  <div style={{ textAlign: 'left', fontSize: `${token.fontSize}px` }}>高级选项</div>
                ),
                children: (
                  <div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', marginBottom: '8px' }}>
                      <Checkbox
                        checked={exportIncludes.includes('config')}
                        onChange={() => handleExportIncludesChange('config')}
                      >
                        配置信息（账户、分类）
                      </Checkbox>
                      <Checkbox
                        checked={exportIncludes.includes('budgets')}
                        onChange={() => handleExportIncludesChange('budgets')}
                      >
                        预算配置
                      </Checkbox>
                      <Checkbox
                        checked={exportIncludes.includes('transactions')}
                        onChange={() => handleExportIncludesChange('transactions')}
                      >
                        交易记录
                      </Checkbox>
                      <Checkbox
                        checked={exportIncludes.includes('snapshots')}
                        onChange={() => handleExportIncludesChange('snapshots')}
                      >
                        投资快照
                      </Checkbox>
                    </div>

                    <Divider style={{ margin: '12px 0' }} />

                    <Space size="small" wrap>
                      <Button size="small" onClick={() => handleQuickSelect('all')}>全选</Button>
                      <Button size="small" onClick={() => handleQuickSelect('config')}>仅配置</Button>
                      <Button size="small" onClick={() => handleQuickSelect('business')}>仅数据</Button>
                      <Button size="small" onClick={() => handleQuickSelect('clear')}>清空</Button>
                    </Space>
                  </div>
                ),
              },
            ]}
          />

          <Button
            type="primary"
            icon={<DownloadOutlined />}
            onClick={handleExport}
            loading={exporting}
            style={{ marginTop: '12px' }}
          >
            导出
          </Button>
        </div>

        <Divider style={{ margin: '24px 0', borderColor: 'var(--mb-color-border-subtle)' }} />

        {/* 数据导入 分区 */}
        <div>
          <h3 style={{ marginTop: 0, fontSize: `${token.fontSizeLG}px`, fontWeight: fontWeightBold }}>数据导入</h3>
          <p style={{ color: colorTextMuted, fontSize: `${token.fontSize}px`, marginBottom: spaceCardPadding }}>
            支持 .zip、.csv、.json 格式的备份文件
          </p>

          <Upload.Dragger
            accept=".zip,.csv,.json"
            showUploadList={false}
            multiple={false}
            beforeUpload={(file) => {
              handleFileSelect(file)
              return false
            }}
            style={{ marginBottom: importFile ? '16px' : 0 }}
          >
            <p className="ant-upload-drag-icon" style={{ marginBottom: 0 }}>
              <InboxOutlined />
            </p>
            <p className="ant-upload-text" style={{ margin: 0 }}>点击或拖拽文件到此处</p>
            <p className="ant-upload-hint" style={{ margin: 0, color: colorTextMuted, fontSize: `${token.fontSizeSM}px` }}>
              支持单个 .zip / .csv / .json 备份文件
            </p>
          </Upload.Dragger>

          {importFile && (
            <>
              <Divider style={{ margin: '12px 0' }} />
              <p style={{ margin: 0, fontWeight: fontWeightBold }}>检测到文件内容：</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', marginTop: '8px' }}>
                <Checkbox
                  checked={importIncludes.includes('transactions')}
                  onChange={() => handleImportIncludesChange('transactions')}
                >
                  交易记录
                </Checkbox>
                <Checkbox
                  checked={importIncludes.includes('config')}
                  onChange={() => handleImportIncludesChange('config')}
                >
                  配置信息
                </Checkbox>
                <Checkbox
                  checked={importIncludes.includes('budgets')}
                  onChange={() => handleImportIncludesChange('budgets')}
                >
                  预算配置
                </Checkbox>
                <Checkbox
                  checked={importIncludes.includes('snapshots')}
                  onChange={() => handleImportIncludesChange('snapshots')}
                >
                  投资快照
                </Checkbox>
              </div>

              <Divider style={{ margin: '12px 0' }} />
              <p style={{ margin: 0, fontWeight: fontWeightBold }}>导入模式：</p>
              <Radio.Group
                value={importMode}
                onChange={(e) => setImportMode(e.target.value)}
                style={{ marginTop: '8px' }}
              >
                <Space direction="vertical">
                  <Radio value="merge">合并（存在则更新，不存在则新增）</Radio>
                  <Radio value="overwrite">覆盖（清空后导入）</Radio>
                </Space>
              </Radio.Group>

              <Button
                type="primary"
                onClick={handleImportBackup}
                loading={importingBackup}
                style={{ marginTop: '12px' }}
              >
                导入
              </Button>

              {renderImportResult(importBackupResult)}
            </>
          )}
        </div>
      </Card>

      {/* 危险操作 */}
      <Card className="surface-card danger-zone" title="危险操作">
        <Alert
          message="执行前建议先导出备份"
          type="warning"
          showIcon
          style={{ marginBottom: spaceCardPadding }}
        />
        <div className="section-grid">
          <div>
            <h3 style={{ color: colorWarning, marginTop: 0 }}>清空交易数据</h3>
            <p style={{ color: colorTextMuted, fontSize: `${token.fontSize}px`, marginBottom: spaceCardPadding }}>
              永久删除所有交易记录与预算数据，账户和分类会保留。
            </p>
            <Button ghost icon={<DeleteOutlined />} onClick={showClearTransactionsConfirm} style={{ borderColor: colorWarning, color: colorWarning }}>
              清空交易数据
            </Button>
          </div>

          <div>
            <h3 style={{ color: colorDanger, marginTop: 0 }}>清空全部数据</h3>
            <p style={{ color: colorTextMuted, fontSize: `${token.fontSize}px`, marginBottom: spaceCardPadding }}>
              删除账户、分类、交易、预算等所有数据，且不可恢复。
            </p>
            <Button danger icon={<DeleteOutlined />} onClick={showClearConfirm} style={{ borderColor: colorDanger, color: colorDanger }}>
              清空全部数据
            </Button>
          </div>
        </div>
      </Card>

      {/* 版本信息 */}
      <Card className="surface-card">
        <div style={{ display: 'flex', alignItems: 'center', gap: spaceCardPadding, flexWrap: 'wrap' }}>
          <div
            style={{
              width: 42,
              height: 42,
              borderRadius: 14,
              background: 'linear-gradient(135deg, var(--mb-color-action-primary), #3b86ff 70%)',
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
            <p style={{ color: colorTextMuted, margin: 0, fontSize: `${token.fontSize}px` }}>
              一款面向个人资产管理的记账应用，数据存储在本地。
            </p>
          </div>
        </div>
      </Card>
    </>
  )
}

export default Settings