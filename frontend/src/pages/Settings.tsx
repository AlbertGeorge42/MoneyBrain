import React from 'react'
import { Card, Button, Modal, message, Popconfirm } from 'antd'
import { DownloadOutlined, UploadOutlined, DeleteOutlined, ExclamationCircleOutlined } from '@ant-design/icons'
import { dataApi } from '../services/api'
import { useStore } from '../stores'

const Settings: React.FC = () => {
  const { fetchAccounts, fetchCategories, fetchTransactions, fetchBudgets, fetchAccountCategories } = useStore()

  const handleExportData = async () => {
    try {
      const [accountsRes, categoriesRes, transactionsRes, budgetsRes, accountCategoriesRes] = await Promise.all([
        fetch('/api/accounts').then(r => r.json()),
        fetch('/api/categories').then(r => r.json()),
        fetch('/api/transactions').then(r => r.json()),
        fetch('/api/budgets').then(r => r.json()),
        fetch('/api/account-categories').then(r => r.json()),
      ])

      const data = {
        accounts: accountsRes.data,
        categories: categoriesRes.data,
        transactions: transactionsRes.data,
        budgets: budgetsRes.data,
        accountCategories: accountCategoriesRes.data,
        exportedAt: new Date().toISOString(),
      }

      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
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

  const handleClearData = async () => {
    try {
      await dataApi.clearAll()
      // 刷新所有数据
      await Promise.all([
        fetchAccounts(),
        fetchCategories(),
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
          <h3>数据备份</h3>
          <p style={{ color: '#666', marginBottom: 16 }}>
            导出所有数据为JSON文件，包括账户、交易记录、预算和分类信息。
          </p>
          <Button icon={<DownloadOutlined />} onClick={handleExportData}>
            导出数据
          </Button>
        </div>
        <div style={{ marginBottom: 24 }}>
          <h3>数据恢复</h3>
          <p style={{ color: '#666', marginBottom: 16 }}>
            从备份文件恢复数据。注意：这将覆盖现有数据。
          </p>
          <Button icon={<UploadOutlined />} disabled>
            导入数据（开发中）
          </Button>
        </div>
        <div>
          <h3 style={{ color: '#cf1322' }}>清空数据</h3>
          <p style={{ color: '#666', marginBottom: 16 }}>
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
