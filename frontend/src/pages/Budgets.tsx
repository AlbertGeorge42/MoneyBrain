import React, { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Button, Card, Progress, Space, Tag, Empty, Spin, theme,
  Typography, Popconfirm, message, Form,
} from 'antd'
import {
  PlusOutlined, DeleteOutlined, EditOutlined,
  ArrowUpOutlined, ArrowDownOutlined, SwapOutlined,
} from '@ant-design/icons'
import { PageHeader } from '../components/common'
import { BudgetModal, BudgetForm, BudgetFormType } from '../components/budgets'
import { budgetApi, accountApi, transactionCategoryApi } from '../services/api'
import type { Budget, BudgetStatus, Account, TransactionCategory } from '@shared/types'
import dayjs from 'dayjs'

const { Text } = Typography

const BUDGET_TYPE_META = {
  income: { label: '收入预算', color: 'green', icon: <ArrowUpOutlined /> },
  expense: { label: '支出预算', color: 'red', icon: <ArrowDownOutlined /> },
  transfer: { label: '转账预算', color: 'blue', icon: <SwapOutlined /> },
} as const

const PERIOD_LABELS: Record<string, string> = {
  daily: '每日',
  weekly: '每周',
  monthly: '月度',
  quarterly: '季度',
  yearly: '年度',
}

const Budgets: React.FC = () => {
  const { token } = theme.useToken()
  const [budgets, setBudgets] = useState<Budget[]>([])
  const [budgetStatuses, setBudgetStatuses] = useState<Record<string, BudgetStatus>>({})
  const [loading, setLoading] = useState(true)
  const [activeTab] = useState<string>('expense')

  // 表单状态
  const [modalVisible, setModalVisible] = useState(false)
  const [editingBudget, setEditingBudget] = useState<Budget | null>(null)
  const [form] = Form.useForm()
  const [submitting, setSubmitting] = useState(false)
  const [formType, setFormType] = useState<BudgetFormType>('expense')

  // 账户和分类数据
  const [accounts, setAccounts] = useState<Account[]>([])
  const [categories, setCategories] = useState<TransactionCategory[]>([])

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [budgetsRes, accountsRes, categoriesRes] = await Promise.all([
        budgetApi.getAll(),
        accountApi.getAll(),
        transactionCategoryApi.getAll(),
      ])
      if (budgetsRes.data.success && budgetsRes.data.data) {
        setBudgets(budgetsRes.data.data)
      }
      if (accountsRes.data.success && accountsRes.data.data) {
        setAccounts(accountsRes.data.data)
      }
      if (categoriesRes.data.success && categoriesRes.data.data) {
        setCategories(categoriesRes.data.data)
      }
    } catch (error) {
      console.error('获取数据失败:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  // 加载预算状态
  useEffect(() => {
    budgets.forEach((budget) => {
      budgetApi.getStatus(budget.id).then((res) => {
        if (res.data.success && res.data.data) {
          setBudgetStatuses((prev) => ({
            ...prev,
            [budget.id]: res.data.data!,
          }))
        }
      }).catch(console.error)
    })
  }, [budgets])

  // 打开新增表单
  const openCreateModal = (type: BudgetFormType) => {
    setEditingBudget(null)
    setFormType(type)
    setModalVisible(true)
  }

  // 打开编辑表单
  const openEditModal = (budget: Budget) => {
    setEditingBudget(budget)
    setFormType(budget.type as BudgetFormType)
    setModalVisible(true)
  }

  // 提交表单
  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      setSubmitting(true)

      const payload = {
        name: values.name,
        type: formType,
        amount: values.amount,
        period: values.period,
        startDate: values.startDate?.toISOString(),
        endDate: values.endDate?.toISOString() ?? null,
        transactionTime: values.transactionTime ?? null,
        note: values.note,
        isActive: values.isActive,
        accountId: values.accountId,
        toAccountId: values.toAccountId ?? null,
        categoryId: values.categoryId,
      }

      if (editingBudget) {
        await budgetApi.update(editingBudget.id, payload)
        message.success('更新成功')
      } else {
        await budgetApi.create(payload)
        message.success('创建成功')
      }

      setModalVisible(false)
      await loadData()
    } catch (error) {
      if (error && typeof error === 'object' && 'errorFields' in error) return
      message.error(editingBudget ? '更新失败' : '创建失败')
    } finally {
      setSubmitting(false)
    }
  }

  // 删除预算
  const handleDelete = async (id: string) => {
    try {
      await budgetApi.delete(id)
      message.success('删除成功')
      setBudgets((prev) => prev.filter((b) => b.id !== id))
    } catch (error) {
      message.error('删除失败')
    }
  }

  // 进度条颜色
  const getProgressColor = (percentage: number, isOverBudget: boolean) => {
    if (isOverBudget) return token.colorError
    if (percentage >= 80) return token.colorWarning
    return token.colorSuccess
  }

  // 状态文案
  const getStatusLabel = (type: string, percentage: number, isOverBudget: boolean) => {
    if (type === 'income') return `达成率: ${percentage.toFixed(1)}%`
    if (isOverBudget) return `超预算: ${percentage.toFixed(1)}%`
    return `使用率: ${percentage.toFixed(1)}%`
  }

  // Tab 项
  const tabItems = [
    { key: 'expense', label: '支出预算' },
    { key: 'income', label: '收入预算' },
    { key: 'transfer', label: '转账预算' },
  ]

  // Modal Tab 项
  const modalTabItems = useMemo(() => [
    {
      key: 'expense',
      label: '支出预算',
      children: (
        <BudgetForm
          type="expense"
          editingBudget={formType === 'expense' ? editingBudget : null}
          accounts={accounts}
          categories={categories}
          form={form}
        />
      ),
    },
    {
      key: 'income',
      label: '收入预算',
      children: (
        <BudgetForm
          type="income"
          editingBudget={formType === 'income' ? editingBudget : null}
          accounts={accounts}
          categories={categories}
          form={form}
        />
      ),
    },
    {
      key: 'transfer',
      label: '转账预算',
      children: (
        <BudgetForm
          type="transfer"
          editingBudget={formType === 'transfer' ? editingBudget : null}
          accounts={accounts}
          categories={categories}
          form={form}
        />
      ),
    },
  ], [editingBudget, accounts, categories, form, formType])

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
        eyebrow="Budgets"
        title="预算管理"
        description="规划未来的收入、支出和资金流动，跟踪预算执行状态"
        actions={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => openCreateModal(activeTab as BudgetFormType)}
          >
            新增预算
          </Button>
        }
      />

      <Space direction="vertical" size="middle" style={{ display: 'flex' }}>
        {tabItems.map((tab) => {
          const tabBudgets = budgets.filter((b) => b.type === tab.key)
          if (tabBudgets.length === 0) return null

          return (
            <Card
              key={tab.key}
              title={
                <Space>
                  {BUDGET_TYPE_META[tab.key as keyof typeof BUDGET_TYPE_META].icon}
                  <span>{tab.label}</span>
                  <Tag>{tabBudgets.length}</Tag>
                </Space>
              }
              size="small"
            >
              <div style={{ display: 'grid', gap: token.padding }}>
                {tabBudgets.map((budget) => {
                  const status = budgetStatuses[budget.id]
                    const percentage = status?.percentage ?? 0
                    const isOverBudget = status?.isOverBudget ?? false
                    const used = status?.used ?? 0

                  return (
                    <Card key={budget.id} size="small" style={{ background: token.colorBgLayout }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: token.paddingSM }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <Space wrap>
                            <Text strong style={{ fontSize: 16 }}>{budget.name}</Text>
                            <Tag>{PERIOD_LABELS[budget.period] ?? budget.period}</Tag>
                            {budget.transactionTime !== null && budget.period !== 'daily' && (
                              <Tag color="blue">
                                {budget.period === 'weekly'
                                  ? ['周一', '周二', '周三', '周四', '周五', '周六', '周日'][budget.transactionTime]
                                  : budget.period === 'monthly'
                                    ? `每月${budget.transactionTime}日`
                                    : `第${budget.transactionTime}天`
                                }
                              </Tag>
                            )}
                            {!budget.isActive && <Tag color="default">已停用</Tag>}
                          </Space>
                          <div style={{ marginTop: 4 }}>
                            <Text type="secondary" style={{ fontSize: 12 }}>
                              {budget.category?.name}
                            </Text>
                          </div>
                          {budget.note && (
                            <div style={{ marginTop: 4 }}>
                              <Text type="secondary" style={{ fontSize: 12 }}>{budget.note}</Text>
                            </div>
                          )}
                        </div>
                        <Space size="small">
                          <Text strong style={{ color: token.colorPrimary, fontSize: 16 }}>
                            ¥{budget.amount.toFixed(2)}
                          </Text>
                          <Button
                            size="small"
                            icon={<EditOutlined />}
                            onClick={() => openEditModal(budget)}
                          />
                          <Popconfirm
                            title="确定删除此预算？"
                            onConfirm={() => handleDelete(budget.id)}
                            okText="确定"
                            cancelText="取消"
                          >
                            <Button size="small" danger icon={<DeleteOutlined />} />
                          </Popconfirm>
                        </Space>
                      </div>

                      <Progress
                        percent={Math.min(percentage, 100)}
                        status={isOverBudget ? 'exception' : undefined}
                        strokeColor={getProgressColor(percentage, isOverBudget)}
                        format={() => getStatusLabel(budget.type, percentage, isOverBudget)}
                      />

                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: token.paddingXS, color: token.colorTextSecondary }}>
                        <span>
                          已{budget.type === 'income' ? '达成' : budget.type === 'transfer' ? '流转' : '使用'}: ¥{used.toFixed(2)}
                        </span>
                        <span>
                          剩余: ¥{Math.max(budget.amount - used, 0).toFixed(2)}
                        </span>
                      </div>
                    </Card>
                  )
                })}
              </div>
            </Card>
          )
        })}

        {budgets.length === 0 && (
          <Card>
            <Empty description="暂无预算数据" />
          </Card>
        )}
      </Space>

      {/* 新增/编辑 Modal */}
      <BudgetModal
        visible={modalVisible}
        title={editingBudget ? '编辑预算' : '新增预算'}
        onSubmit={handleSubmit}
        onCancel={() => setModalVisible(false)}
        submitButtonDisabled={submitting}
        tabItems={modalTabItems}
        activeTab={formType}
        onTabChange={(key) => {
          setFormType(key as BudgetFormType)
          form.resetFields()
          form.setFieldsValue({
            period: 'monthly',
            isActive: true,
            startDate: dayjs(),
          })
        }}
      />
    </div>
  )
}

export default Budgets