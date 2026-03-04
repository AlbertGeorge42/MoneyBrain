import React, { useEffect } from 'react'
import { Card, Button, message } from 'antd'
import { DownloadOutlined, UploadOutlined } from '@ant-design/icons'
import { useStore } from '../stores'
import { accountApi, transactionApi, budgetApi } from '../services/api'

const Settings: React.FC = () => {
  const { 
    categories, 
    accountCategories, 
    fetchCategories,
    fetchAccountCategories,
  } = useStore()

  useEffect(() => {
    fetchCategories()
    fetchAccountCategories()
  }, [])

  const handleExportData = async () => {
    try {
      const [accountsRes, transactionsRes, budgetsRes] = await Promise.all([
        accountApi.getAll(),
        transactionApi.getAll(),
        budgetApi.getAll(),
      ])

      const exportData = {
        exportDate: new Date().toISOString(),
        accounts: accountsRes.data.data || [],
        transactions: transactionsRes.data.data?.list || [],
        budgets: budgetsRes.data.data || [],
        categories: categories,
        accountCategories: accountCategories,
      }

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `moneybrain-backup-${new Date().toISOString().split('T')[0]}.json`
      a.click()
      URL.revokeObjectURL(url)
      message.success('数据导出成功')
    } catch (error) {
      message.error('数据导出失败')
    }
  }

  return (
    <div>
      <h2 style={{ marginBottom: 16 }}>设置</h2>

      <Card title="数据管理" style={{ marginBottom: 16 }}>
        <div style={{ marginBottom: 24 }}>
          <h3>数据备份</h3>
          <p style={{ color: '#666', marginBottom: 16 }}>
            导出所有数据为JSON文件，包括账户、交易记录、预算和分类信息。
          </p>
          <Button icon={<DownloadOutlined />} onClick={handleExportData}>
            导出数据
          </Button>
        </div>
        <div>
          <h3>数据恢复</h3>
          <p style={{ color: '#666', marginBottom: 16 }}>
            从备份文件恢复数据。注意：这将覆盖现有数据。
          </p>
          <Button icon={<UploadOutlined />} disabled>
            导入数据（开发中）
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
