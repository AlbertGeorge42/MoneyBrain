import React, { useEffect } from 'react'
import { Form, Input, Select, InputNumber, DatePicker, Row, Col, TreeSelect } from 'antd'
const { RangePicker } = DatePicker
import dayjs from 'dayjs'
import { Account, TransactionCategory, Budget } from '../../services/api'
import { buildSortedTree as buildTreeData } from '@shared/utils/tree'

export type BudgetFormType = 'income' | 'expense' | 'transfer'

interface BudgetFormProps {
  type: BudgetFormType
  editingBudget?: Budget | null
  accounts: Account[]
  categories: TransactionCategory[]
  form: ReturnType<typeof Form.useForm>[0]
  disableTypeSwitch?: boolean // 编辑模式下禁止切换类型（由父组件控制 tabs）
}

const PERIOD_OPTIONS = [
  { value: 'daily', label: '每日' },
  { value: 'weekly', label: '每周' },
  { value: 'monthly', label: '月度' },
  { value: 'quarterly', label: '季度' },
  { value: 'yearly', label: '年度' },
]

const WEEK_DAY_OPTIONS = [
  { value: 0, label: '周一' },
  { value: 1, label: '周二' },
  { value: 2, label: '周三' },
  { value: 3, label: '周四' },
  { value: 4, label: '周五' },
  { value: 5, label: '周六' },
  { value: 6, label: '周日' },
]

const BudgetForm: React.FC<BudgetFormProps> = ({
  type,
  editingBudget,
  accounts,
  categories,
  form,
}) => {
  const currentPeriod: string | undefined = Form.useWatch('period', form)
  useEffect(() => {
    if (editingBudget) {
      form.setFieldsValue({
        name: editingBudget.name,
        amount: editingBudget.amount,
        period: editingBudget.period,
        dateRange: [
          dayjs(editingBudget.startDate),
          editingBudget.endDate ? dayjs(editingBudget.endDate) : null,
        ],
        transactionTime: editingBudget.transactionTime ?? null,
        note: editingBudget.note,
        accountId: editingBudget.accountId,
        toAccountId: editingBudget.toAccountId,
        categoryId: editingBudget.categoryId,
      })
    } else {
      form.resetFields()
      form.setFieldsValue({
        period: 'monthly',
        dateRange: [dayjs(), null],
      })
    }
  }, [editingBudget, form])

  const getTypeCategories = () => {
    const filtered = categories.filter(c => c.type === type)
    return buildTreeData(filtered)
  }

  const renderAccountSelector = () => {
    if (type === 'transfer') {
      return (
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              name="accountId"
              label="转出账户"
              rules={[{ required: true, message: '请选择转出账户' }]}
            >
              <Select placeholder="请选择转出账户" showSearch optionFilterProp="children">
                {accounts.map(a => (
                  <Select.Option key={a.id} value={a.id}>
                    {a.name}
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              name="toAccountId"
              label="转入账户"
              rules={[{ required: true, message: '请选择转入账户' }]}
            >
              <Select placeholder="请选择转入账户" showSearch optionFilterProp="children">
                {accounts.map(a => (
                  <Select.Option key={a.id} value={a.id}>
                    {a.name}
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>
          </Col>
        </Row>
      )
    }

    return (
      <Form.Item
        name="accountId"
        label="关联账户"
        rules={[{ required: true, message: '请选择账户' }]}
      >
        <Select placeholder="请选择账户" showSearch optionFilterProp="children">
          {accounts.map(a => (
            <Select.Option key={a.id} value={a.id}>
              {a.name}
            </Select.Option>
          ))}
        </Select>
      </Form.Item>
    )
  }

  const renderCategorySelector = () => {
    const treeData = getTypeCategories()
    if (treeData.length === 0) return null

    return (
      <Form.Item
        name="categoryId"
        label="关联分类"
        rules={[{ required: true, message: '请选择分类' }]}
      >
        <TreeSelect
          placeholder="请选择分类"
          treeData={treeData}
          fieldNames={{ label: 'name', value: 'id', children: 'children' }}
        />
      </Form.Item>
    )
  }

  // 根据周期类型动态显示交易时间输入
  const renderTransactionTimeInput = () => {
    if (!currentPeriod || currentPeriod === 'daily') return null

    if (currentPeriod === 'weekly') {
      return (
        <Form.Item name="transactionTime" label="交易日">
          <Select
            allowClear
            placeholder="默认周日"
            options={WEEK_DAY_OPTIONS}
          />
        </Form.Item>
      )
    }

    if (currentPeriod === 'monthly') {
      return (
        <Form.Item name="transactionTime" label="交易日">
          <InputNumber
            min={1}
            max={28}
            placeholder="默认月末"
            style={{ width: '100%' }}
          />
        </Form.Item>
      )
    }

    // quarterly / yearly
    const maxVal = currentPeriod === 'yearly' ? 364 : 89
    return (
      <Form.Item name="transactionTime" label="天偏移">
        <InputNumber
          min={0}
          max={maxVal}
          placeholder="默认周期末"
          style={{ width: '100%' }}
        />
      </Form.Item>
    )
  }

  return (
    <Form form={form} layout="vertical">
      <Form.Item
        name="name"
        label="预算名称"
        rules={[{ required: true, message: '请输入预算名称' }]}
      >
        <Input placeholder={type === 'income' ? '如：每月工资' : type === 'expense' ? '如：餐饮预算' : '如：ETF定投'} />
      </Form.Item>

      <Row gutter={16}>
        <Col span={12}>
          <Form.Item
            name="amount"
            label="预算金额"
            rules={[{ required: true, message: '请输入金额' }]}
          >
            <InputNumber
              style={{ width: '100%' }}
              min={0}
              precision={2}
              prefix="¥"
              placeholder="0.00"
            />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item
            name="period"
            label="预算周期"
            rules={[{ required: true, message: '请选择周期' }]}
          >
            <Select options={PERIOD_OPTIONS} />
          </Form.Item>
        </Col>
      </Row>

      <Form.Item
        name="dateRange"
        label="日期范围"
        rules={[{ required: true, message: '请选择开始日期' }]}
      >
        <RangePicker
          style={{ width: '100%' }}
          placeholder={['开始日期', '结束日期（可选）']}
        />
      </Form.Item>

      {renderTransactionTimeInput()}

      {renderAccountSelector()}

      {renderCategorySelector()}

      <Form.Item
        name="note"
        label="备注"
      >
        <Input.TextArea rows={2} placeholder="可选备注" />
      </Form.Item>
    </Form>
  )
}

export default BudgetForm