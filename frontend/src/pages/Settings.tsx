import React, { useRef, useState } from 'react'
import { Button, Card, Modal, Radio, Space, Tag, message } from 'antd'
import {
  CheckCircleOutlined,
  DeleteOutlined,
  DesktopOutlined,
  DownloadOutlined,
  ExclamationCircleOutlined,
  MoonOutlined,
  SunOutlined,
  UploadOutlined,
} from '@ant-design/icons'
import { PageHeader, RangeTimePickerField, type RangeTimePickerConfig, type RangeTimeValue } from '../components/common'
import { dataApi } from '../services/api'
import { useStore } from '../stores'
import { useTheme } from '../styles/ThemeContext'
import {
  colorDanger,
  colorMuted,
  colorNeutral,
  colorPrimary,
  colorSuccess,
  colorWarning,
  fontWeightBold,
  radiusMd,
  spaceSm,
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

const Settings: React.FC = () => {
  const { fetchAccounts, fetchTransactionCategories, fetchTransactions, fetchBudgets, fetchAccountCategories } = useStore()
  const { mode, theme, setThemeMode } = useTheme()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState(false)
  const [importProgress, setImportProgress] = useState<{ imported: number; skipped: number } | null>(null)
  const [exportDateRange, setExportDateRange] = useState<RangeTimeValue | null>(null)
  const [exporting, setExporting] = useState(false)
  const [importDateRange, setImportDateRange] = useState<RangeTimeValue | null>(null)

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
    try {
      const params: { startDate?: string; endDate?: string } = {}
      if (exportDateRange) {
        params.startDate = exportDateRange.start.toISOString()
        params.endDate = exportDateRange.end.toISOString()
      }

      const response = await dataApi.exportCsv(Object.keys(params).length ? params : undefined)
      const blob = response.data
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `moneybrain-export-${new Date().toISOString().split('T')[0]}.csv`
      anchor.click()
      URL.revokeObjectURL(url)
      message.success('数据导出成功')
    } catch (error) {
      message.error('数据导出失败')
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
    } catch (error) {
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

  const handleClearTransactions = async () => {
    try {
      await dataApi.clearTransactions()
      await Promise.all([fetchTransactions(), fetchBudgets()])
      message.success('交易数据已清空')
    } catch (error) {
      message.error('清空交易数据失败')
    }
  }

  const handleClearData = async () => {
    try {
      await dataApi.clearAll()
      await refreshData()
      message.success('所有数据已清空')
    } catch (error) {
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

  return (
    <>
      <PageHeader
        eyebrow="Settings"
        title="设置与数据"
        description="管理主题、备份和高风险操作。"
      />

      <Card className="surface-card" title="外观主题">
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Radio.Group value={mode} onChange={(event) => setThemeMode(event.target.value)}>
            <Space wrap>
              <Radio.Button value="light">
                <SunOutlined /> 浅色
              </Radio.Button>
              <Radio.Button value="dark">
                <MoonOutlined /> 深色
              </Radio.Button>
              <Radio.Button value="system">
                <DesktopOutlined /> 跟随系统
              </Radio.Button>
            </Space>
          </Radio.Group>
          <Tag color={theme === 'dark' ? 'blue' : 'default'} icon={<CheckCircleOutlined />} bordered={false}>
            当前生效：{mode === 'system' ? `跟随系统 / ${theme === 'dark' ? '深色' : '浅色'}` : theme === 'dark' ? '深色' : '浅色'}
          </Tag>
        </Space>
      </Card>

      <Card className="surface-card" title="导入与导出">
        <div className="section-grid">
          <div>
            <h3>导出 CSV</h3>
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

          <div>
            <h3>导入 CSV</h3>
            <Space wrap>
              <RangeTimePickerField
                value={importDateRange}
                config={exportTimePickerConfig}
                onChange={setImportDateRange}
                placeholder="全部数据"
              />
              <input ref={fileInputRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={handleFileChange} />
              <Button icon={<UploadOutlined />} onClick={() => fileInputRef.current?.click()} loading={importing}>
                导入 CSV
              </Button>
            </Space>
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
      </Card>

      <Card className="surface-card danger-zone" title="危险操作">
        <div className="section-grid">
          <div>
            <h3 style={{ color: colorWarning }}>清空交易数据</h3>
            <Button ghost icon={<DeleteOutlined />} onClick={showClearTransactionsConfirm} style={{ borderColor: colorWarning, color: colorWarning }}>
              清空交易数据
            </Button>
          </div>

          <div>
            <h3 style={{ color: colorDanger }}>清空全部数据</h3>
            <Button danger icon={<DeleteOutlined />} onClick={showClearConfirm}>
              清空全部数据
            </Button>
          </div>
        </div>
      </Card>

      <Card className="surface-card" title="关于">
        <p style={{ marginTop: 0, fontWeight: fontWeightBold }}>MoneyBrain 1.0.0</p>
        <p style={{ color: colorNeutral, marginBottom: 0 }}>
          一款面向个人资产管理的记账应用，核心关注账户、流水、报表和后续的预算重构。
        </p>
      </Card>
    </>
  )
}

export default Settings
