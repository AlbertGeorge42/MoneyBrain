import React, { useEffect } from 'react'
import { Form, Input, Select, InputNumber, DatePicker, Row, Col, Switch, TreeSelect } from 'antd'
import dayjs from 'dayjs'
import { Account, TransactionCategory, Budget } from '../../services/api'
import { buildTreeData } from '../../utils/treeUtils'
import DynamicIcon from '../common/DynamicIcon'

export type BudgetFormType = 'income' | 'expense' | 'transfer'

interface BudgetFormProps {
  type: BudgetFormType
  editingBudget?: Budget | null
  accounts: Account[]
  categories: TransactionCategory[]
  form: ReturnType<typeof Form.useForm>[0]
}

const PERIOD_OPTIONS = [
  { value: 'monthly', label: '月度' },
  { value: 'quarterly', label: '季度' },
  { value: 'yearly', label: '年度' },
]

const BudgetForm: React.FC<BudgetFormProps> = ({
  type,
  editingBudget,
  accounts,
  categories,
  form,
}) => {
  useEffect(() => {
    if (editingBudget) {
      form.setFieldsValue({
        name: editingBudget.name,
        amount: editingBudget.amount,
        period: editingBudget.period,
        startDate: dayjs(editingBudget.startDate),
        endDate: editingBudget.endDate ? dayjs(editingBudget.endDate) : null,
        note: editingBudget.note,
        isActive: editingBudget.isActive,
        accountId: editingBudget.accountId,
        toAccountId: editingBudget.toAccountId,
        categoryId: editingBudget.categoryId,
      })
    } else {
      form.resetFields()
      form.setFieldsValue({
        period: 'monthly',
        isActive: true,
        startDate: dayjs(),
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
                    {a.icon && <DynamicIcon name={a.icon} size={16} />} {a.name}
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
                    {a.icon && <DynamicIcon name={a.icon} size={16} />} {a.name}
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
              {a.icon && <DynamicIcon name={a.icon} size={16} />} {a.name}
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

      <Row gutter={16}>
        <Col span={12}>
          <Form.Item
            name="startDate"
            label="开始日期"
            rules={[{ required: true, message: '请选择开始日期' }]}
          >
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item
            name="endDate"
            label="结束日期"
          >
            <DatePicker style={{ width: '100%' }} placeholder="无限制" />
          </Form.Item>
        </Col>
      </Row>

      {renderAccountSelector()}

      {renderCategorySelector()}

      <Form.Item
        name="note"
        label="备注"
      >
        <Input.TextArea rows={2} placeholder="可选备注" />
      </Form.Item>

      <Form.Item
        name="isActive"
        label="启用"
        valuePropName="checked"
      >
        <Switch />
      </Form.Item>
    </Form>
  )
}

export default BudgetForm