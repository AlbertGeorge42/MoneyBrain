import React, { useRef, useState } from 'react'
import { Card, Button, Modal, message, Space } from 'antd'
import { DownloadOutlined, UploadOutlined, DeleteOutlined, ExclamationCircleOutlined } from '@ant-design/icons'
import { dataApi } from '../services/api'
import { useStore } from '../stores'
import { RangeTimePickerField, type RangeTimePickerConfig, type RangeTimeValue } from '../components/common'
import { createRangePeriodPreset, createTrailingRangePreset } from '../utils/timePicker'

const exportTimePickerConfig: RangeTimePickerConfig = {
  label: '导出时间范围',
  allowedGranularities: ['day', 'month', 'year'],
  presets: {
    day: [
      createRangePeriodPreset('today', '今天', 'day'),
      createTrailingRangePreset('last-7-days', '近7天', 7, 'day'),
      createTrailingRangePreset('last-30-days', '近30天', 30, 'day'),
    ],
    month: [
      createRangePeriodPreset('current-month', '本月', 'month'),
      createRangePeriodPreset('previous-month', '上月', 'month', -1),
      createTrailingRangePreset('last-3-months', '近3个月', 3, 'month'),
    ],
    year: [
      createRangePeriodPreset('current-year', '今年', 'year'),
      createRangePeriodPreset('previous-year', '去年', 'year', -1),
    ],
  },
}

const Settings: React.FC = () => {
  const { fetchAccounts, fetchTransactionCategories, fetchTransactions, fetchBudgets, fetchAccountCategories } = useStore()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState(false)
  const [importProgress, setImportProgress] = useState<{ imported: number; skipped: number } | null>(null)
  const [exportDateRange, setExportDateRange] = useState<RangeTimeValue | null>(null)
  const [exporting, setExporting] = useState(false)
  const [importDateRange, setImportDateRange] = useState<RangeTimeValue | null>(null)

  const handleExportCSV = async () => {
    setExporting(true)
    try {
      const params: { startDate?: string; endDate?: string } = {}
      if (exportDateRange) {
        params.startDate = exportDateRange.start.toISOString()
        params.endDate = exportDateRange.end.toISOString()
      }
      
      const response = await dataApi.exportCsv(Object.keys(params).length > 0 ? params : undefined)
      const blob = response.data
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `moneybrain-export-${new Date().toISOString().split('T')[0]}.csv`
      a.click()
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
      
      const response = await dataApi.importCsv(file, Object.keys(params).length > 0 ? params : undefined)
      const result = response.data

      if (result.success && result.data) {
        setImportProgress({
          imported: result.data.imported,
          skipped: result.data.skipped,
        })
        message.success(`导入完成：成功 ${result.data.imported} 条，跳过 ${result.data.skipped} 条`)
        
        // 刷新数据
        await Promise.all([
          fetchAccounts(),
          fetchTransactionCategories(),
          fetchTransactions(),
          fetchBudgets(),
          fetchAccountCategories(),
        ])
      } else {
        message.error(result.error?.message || '导入失败')
      }
    } catch (error) {
      message.error('导入失败，请检查文件格式')
    } finally {
      setImporting(false)
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (!file.name.endsWith('.csv')) {
        message.error('请选择CSV文件')
        return
      }
      handleImportCSV(file)
    }
    // 重置input以便可以重复选择同一文件
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleClearData = async () => {
    try {
      await dataApi.clearAll()
      await Promise.all([
        fetchAccounts(),
        fetchTransactionCategories(),
        fetchTransactions(),
        fetchBudgets(),
        fetchAccountCategories(),
      ])
      message.success('所有数据已清空')
    } catch (error) {
      message.error('清空数据失败')
    }
  }

  const handleClearTransactions = async () => {
    try {
      await dataApi.clearTransactions()
      await Promise.all([
        fetchTransactions(),
        fetchBudgets(),
      ])
      message.success('交易数据已清空')
    } catch (error) {
      message.error('清空交易数据失败')
    }
  }

  const showClearTransactionsConfirm = () => {
    Modal.confirm({
      title: '确认清空交易数据',
      icon: <ExclamationCircleOutlined />,
      content: (
        <div>
          <p style={{ color: '#cf1322', fontWeight: 'bold', marginBottom: 12 }}>
            ⚠️ 此操作将永久删除以下数据：
          </p>
          <ul style={{ marginLeft: 20, color: '#666' }}>
            <li>所有交易记录</li>
            <li>所有预算设置</li>
          </ul>
          <p style={{ color: '#52c41a', marginTop: 12 }}>
            ✓ 账户和分类信息将保留
          </p>
          <p style={{ color: '#cf1322', marginTop: 8 }}>
            此操作不可恢复！请确保已导出备份。
          </p>
        </div>
      ),
      okText: '确认清空',
      okType: 'danger',
      cancelText: '取消',
      onOk: handleClearTransactions,
    })
  }

  const showClearConfirm = () => {
    Modal.confirm({
      title: '确认清空所有数据',
      icon: <ExclamationCircleOutlined />,
      content: (
        <div>
          <p style={{ color: '#cf1322', fontWeight: 'bold', marginBottom: 12 }}>
            ⚠️ 此操作将永久删除以下数据：
          </p>
          <ul style={{ marginLeft: 20, color: '#666' }}>
            <li>所有账户分类</li>
            <li>所有账户</li>
            <li>所有收支分类</li>
            <li>所有交易记录</li>
            <li>所有预算设置</li>
            <li>所有余额快照</li>
          </ul>
          <p style={{ color: '#cf1322', marginTop: 12 }}>
            此操作不可恢复！请确保已导出备份。
          </p>
        </div>
      ),
      okText: '确认清空',
      okType: 'danger',
      cancelText: '取消',
      onOk: handleClearData,
    })
  }

  return (
    <div>
      <h2 style={{ marginBottom: 16 }}>设置</h2>

      <Card title="数据管理" style={{ marginBottom: 16 }}>
        <div style={{ marginBottom: 24 }}>
          <h3>数据导出</h3>
          <p style={{ color: '#666', marginBottom: 12 }}>
            导出交易记录为CSV文件，兼容钱迹格式，可用于数据备份或导入其他记账软件。
          </p>
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <div>
              <Space>
                <RangeTimePickerField
                  value={exportDateRange}
                  config={exportTimePickerConfig}
                  onChange={setExportDateRange}
                  placeholder="全部数据"
                />
                <Button 
                  icon={<DownloadOutlined />} 
                  onClick={handleExportCSV}
                  loading={exporting}
                  style={{ width: 140 }}
                >
                  导出CSV
                </Button>
              </Space>
            </div>
            <p style={{ color: '#999', fontSize: 12, margin: 0 }}>
              提示：不选择时间范围则导出全部数据
            </p>
          </Space>
        </div>
        
        <div style={{ marginBottom: 24 }}>
          <h3>数据导入</h3>
          <p style={{ color: '#666', marginBottom: 12 }}>
            从CSV文件导入交易记录，支持钱迹导出格式。导入时会自动创建不存在的账户和分类。
          </p>
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <div>
              <Space>
                <RangeTimePickerField
                  value={importDateRange}
                  config={exportTimePickerConfig}
                  onChange={setImportDateRange}
                  placeholder="全部数据"
                />
                <input
                  type="file"
                  ref={fileInputRef}
                  accept=".csv"
                  style={{ display: 'none' }}
                  onChange={handleFileChange}
                />
                <Button 
                  icon={<UploadOutlined />} 
                  onClick={() => fileInputRef.current?.click()}
                  loading={importing}
                  style={{ width: 140 }}
                >
                  导入CSV
                </Button>
              </Space>
            </div>
            <p style={{ color: '#999', fontSize: 12, margin: 0 }}>
              提示：不选择时间范围则导入文件中的全部数据
            </p>
          </Space>
          {importProgress && (
            <div style={{ marginTop: 12, padding: 12, background: '#f5f5f5', borderRadius: 4 }}>
              <p style={{ margin: 0 }}>
                ✅ 成功导入：<strong>{importProgress.imported}</strong> 条
              </p>
              <p style={{ margin: 0, color: '#999' }}>
                跳过：{importProgress.skipped} 条（格式错误、数据不完整或不在时间范围内）
              </p>
            </div>
          )}
        </div>
        
        <div style={{ marginBottom: 24 }}>
          <h3 style={{ color: '#fa8c16' }}>清空交易数据</h3>
          <p style={{ color: '#666', marginBottom: 12 }}>
            仅清空交易记录和预算，保留账户和分类信息。此操作不可恢复！
          </p>
          <Button 
            type="primary"
            ghost
            style={{ borderColor: '#fa8c16', color: '#fa8c16', width: 140 }}
            icon={<DeleteOutlined />} 
            onClick={showClearTransactionsConfirm}
          >
            清空交易数据
          </Button>
        </div>
        
        <div style={{ marginBottom: 24 }}>
          <h3 style={{ color: '#cf1322' }}>清空所有数据</h3>
          <p style={{ color: '#666', marginBottom: 12 }}>
            清空所有数据，包括账户、交易记录、预算和分类信息。此操作不可恢复！
          </p>
          <Button 
            danger 
            icon={<DeleteOutlined />} 
            onClick={showClearConfirm}
            style={{ width: 140 }}
          >
            清空所有数据
          </Button>
        </div>
      </Card>

      <Card title="关于">
        <h3>MoneyBrain 个人记账软件</h3>
        <p>版本: 1.0.0</p>
        <p style={{ color: '#666' }}>
          一款简洁高效的个人记账软件，支持资产负债管理、收支记录、财务报表生成与分析。
        </p>
      </Card>
    </div>
  )
}

export default Settings
