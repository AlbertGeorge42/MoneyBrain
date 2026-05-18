import React, { useState, useEffect, useMemo } from 'react'
import { Button, Card, Progress, Space, Statistic, Tag, Empty, Spin, theme } from 'antd'
import { ReloadOutlined, SettingOutlined } from '@ant-design/icons'
import { PageHeader } from '../components/common'
import { budgetApi } from '../services/api'
import type { Budget, BudgetStatus } from '@shared/types'

const Budgets: React.FC = () => {
  const { token } = theme.useToken()
  const [budgets, setBudgets] = useState<Budget[]>([])
  const [budgetStatuses, setBudgetStatuses] = useState<Record<string, BudgetStatus>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setLoading(true)
    try {
      const budgetsRes = await budgetApi.getAll()
      if (budgetsRes.data.success) {
        setBudgets(budgetsRes.data.data || [])
      }
    } catch (error) {
      console.error('获取数据失败:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    budgets.forEach((budget) => {
      fetchBudgetStatus(budget.id)
    })
  }, [budgets])

  const fetchBudgetStatus = async (id: string) => {
    try {
      const res = await budgetApi.getStatus(id)
      const status = res.data.data
      if (res.data.success && status) {
        setBudgetStatuses((prev) => ({
          ...prev,
          [id]: status,
        }))
      }
    } catch (error) {
      console.error('获取预算状态失败:', error)
    }
  }

  const totalBudget = useMemo(() => budgets.reduce((sum, b) => sum + b.amount, 0), [budgets])
  const totalUsed = useMemo(
    () => Object.values(budgetStatuses).reduce((sum, status) => sum + status.used, 0),
    [budgetStatuses]
  )

  const getProgressColor = (percentage: number, isOverBudget: boolean) => {
    if (isOverBudget) return token.colorError
    if (percentage >= 80) return token.colorWarning
    return token.colorSuccess
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <Spin size="large" />
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title="预算管理"
        description="预算模块待重做。"
        actions={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={fetchData}>
              刷新
            </Button>
            <Button icon={<SettingOutlined />}>设置</Button>
          </Space>
        }
      />

      <Card>
        <div className="stats-grid">
          <Statistic title="总预算" value={totalBudget} precision={2} prefix="¥" />
          <Statistic
            title="已使用"
            value={totalUsed}
            precision={2}
            valueStyle={{ color: token.colorError }}
            prefix="¥"
          />
          <Statistic
            title="剩余"
            value={totalBudget - totalUsed}
            precision={2}
            valueStyle={{ color: token.colorSuccess }}
            prefix="¥"
          />
        </div>
      </Card>

      {budgets.length === 0 ? (
        <Card>
          <Empty description="暂无预算数据" />
        </Card>
      ) : (
        <div style={{ display: 'grid', gap: `${token.padding}px` }}>
          {budgets.map((budget) => {
            const status = budgetStatuses[budget.id]
            const percentage = status?.percentage ?? 0
            const isOverBudget = status?.isOverBudget ?? false
            const used = status?.used ?? 0

            return (
              <Card key={budget.id} size="small">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: `${token.padding}px` }}>
                  <div>
                    <span style={{ fontWeight: 500 }}>{budget.name}</span>
                    <Tag style={{ marginLeft: 8 }} color={budget.period === 'monthly' ? 'blue' : 'green'}>
                      {budget.period === 'monthly' ? '月度' : '年度'}
                    </Tag>
                    {budget.category && <Tag>{budget.category.name}</Tag>}
                  </div>
                  <span style={{ color: token.colorPrimary, fontWeight: 500 }}>¥{budget.amount.toFixed(2)}</span>
                </div>
                <Progress
                  percent={Math.min(percentage, 100)}
                  status={isOverBudget ? 'exception' : undefined}
                  strokeColor={getProgressColor(percentage, isOverBudget)}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: `${token.paddingXS}px`, color: token.colorError }}>
                  <span>已使用: ¥{used.toFixed(2)}</span>
                  <span>{percentage.toFixed(1)}%</span>
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default Budgets
