import React, { useRef, useState } from 'react'
import { Card, Button, Modal, message } from 'antd'
import { DownloadOutlined, UploadOutlined, DeleteOutlined, ExclamationCircleOutlined } from '@ant-design/icons'
import { dataApi } from '../services/api'
import { useStore } from '../stores'

const Settings: React.FC = () => {
  const { fetchAccounts, fetchTransactionCategories, fetchTransactions, fetchBudgets, fetchAccountCategories } = useStore()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState(false)
  const [importProgress, setImportProgress] = useState<{ imported: number; skipped: number } | null>(null)

  const handleExportCSV = async () => {
    try {
      const response = await fetch('/api/data/export')
      if (!response.ok) throw new Error('导出失败')
      
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `moneybrain-export-${new Date().toISOString().split('T')[0]}.csv`
      a.click()
      URL.revokeObjectURL(url)
      message.success('数据导出成功')
    } catch (error) {
      message.error('数据导出失败')
    }
  }

  const handleImportCSV = async (file: File) => {
    setImporting(true)
    setImportProgress(null)
    
    try {
      const formData = new FormData()
      formData.append('file', file)
      
      const response = await fetch('/api/data/import', {
        method: 'POST',
        body: formData,
      })
      
      const result = await response.json()
      
      if (result.success) {
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
          <Button icon={<DownloadOutlined />} onClick={handleExportCSV}>
            导出CSV
          </Button>
        </div>
        
        <div style={{ marginBottom: 24 }}>
          <h3>数据导入</h3>
          <p style={{ color: '#666', marginBottom: 12 }}>
            从CSV文件导入交易记录，支持钱迹导出格式。导入时会自动创建不存在的账户和分类。
          </p>
          <div>
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
            >
              导入CSV
            </Button>
          </div>
          {importProgress && (
            <div style={{ marginTop: 12, padding: 12, background: '#f5f5f5', borderRadius: 4 }}>
              <p style={{ margin: 0 }}>
                ✅ 成功导入：<strong>{importProgress.imported}</strong> 条
              </p>
              <p style={{ margin: 0, color: '#999' }}>
                跳过：{importProgress.skipped} 条（格式错误或数据不完整）
              </p>
            </div>
          )}
        </div>
        
        <div>
          <h3 style={{ color: '#cf1322' }}>清空数据</h3>
          <p style={{ color: '#666', marginBottom: 12 }}>
            清空所有数据，包括账户、交易记录、预算和分类信息。此操作不可恢复！
          </p>
          <Button 
            danger 
            icon={<DeleteOutlined />} 
            onClick={showClearConfirm}
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
