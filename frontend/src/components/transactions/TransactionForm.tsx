import React, { useEffect } from 'react'
import { Form, Input, Select, InputNumber, DatePicker, Row, Col, TreeSelect, Tag, Space } from 'antd'
import dayjs from 'dayjs'
import { Account, TransactionCategory, Transaction } from '../../services/api'
import { buildTreeData } from '../../utils/treeUtils'
import DynamicIcon from '../common/DynamicIcon'
import { formatBalance } from '../../utils/formatBalance'
import { colorMuted, colorIncome, colorExpense } from '../../styles/tokens'

export type TransactionFormType = 'expense' | 'income' | 'transfer' | 'refund'

interface TransactionFormProps {
  type: TransactionFormType
  editingTransaction?: Transaction | null
  accounts: Account[]
  categories: TransactionCategory[]
  form: ReturnType<typeof Form.useForm>[0]
  /** 当从普通交易创建退款时，需要显示原交易信息 */
  showRefundSourceInfo?: boolean
  /** 原交易信息（仅在创建退款时使用） */
  sourceTransaction?: Transaction | null
}

const TransactionForm: React.FC<TransactionFormProps> = ({
  type,
  editingTransaction,
  accounts,
  categories,
  form,
  showRefundSourceInfo = false,
  sourceTransaction = null,
}) => {
  useEffect(() => {
    if (editingTransaction) {
      const baseValues = {
        amount: editingTransaction.amount,
        fee: editingTransaction.fee || 0,
        coupon: editingTransaction.coupon || 0,
        date: dayjs(editingTransaction.date),
        note: editingTransaction.note,
      }

      if (type === 'transfer') {
        form.setFieldsValue({
          ...baseValues,
          fromAccountId: editingTransaction.accountId,
          toAccountId: editingTransaction.toAccountId,
          categoryId: editingTransaction.categoryId,
        })
      } else if (type === 'refund') {
        form.setFieldsValue({
          ...baseValues,
          accountId: editingTransaction.accountId,
        })
      } else {
        form.setFieldsValue({
          ...baseValues,
          type: editingTransaction.type,
          accountId: editingTransaction.accountId,
          categoryId: editingTransaction.categoryId,
        })
      }
    } else {
      form.resetFields()
      if (type !== 'transfer' && type !== 'refund') {
        form.setFieldsValue({ type })
      }
    }
  }, [editingTransaction, type, form])

  const getTypeCategories = (formType: string) => {
    const filtered = categories.filter(c => c.type === formType)
    return buildTreeData(filtered)
  }

  const renderRefundSourceInfo = () => {
    if (!showRefundSourceInfo || !sourceTransaction) return null

    return (
      <div style={{ marginBottom: 16, padding: 12, backgroundColor: '#f5f5f5', borderRadius: 6 }}>
        <div style={{ color: colorMuted, fontSize: 12, marginBottom: 8 }}>原交易</div>
        <Space>
          <Tag style={{ color: sourceTransaction.type === 'income' ? colorIncome : colorExpense, borderColor: sourceTransaction.type === 'income' ? colorIncome : colorExpense, backgroundColor: 'transparent' }}>
            {sourceTransaction.type === 'income' ? '收入' : '支出'}
          </Tag>
          {sourceTransaction.category?.icon && <DynamicIcon name={sourceTransaction.category.icon} size={16} />}
          {sourceTransaction.category?.name || '未分类'} - ¥{sourceTransaction.amount.toFixed(2)}
          <span style={{ color: colorMuted }}>({dayjs(sourceTransaction.date).format('YYYY-MM-DD')})</span>
        </Space>
      </div>
    )
  }

  const renderAccountSelector = () => {
    if (type === 'transfer') {
      return (
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              name="fromAccountId"
              label="转出账户"
              rules={[{ required: true, message: '请选择转出账户' }]}
            >
              <Select placeholder="请选择转出账户">
                {accounts.map(a => {
                  const balanceDisplay = formatBalance(a.balance, a.type as 'asset' | 'liability')
                  return (
                    <Select.Option key={a.id} value={a.id}>
                      <DynamicIcon name={a.icon} size={16} /> {a.name} ({balanceDisplay.text})
                    </Select.Option>
                  )
                })}
              </Select>
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              name="toAccountId"
              label="转入账户"
              rules={[{ required: true, message: '请选择转入账户' }]}
            >
              <Select placeholder="请选择转入账户">
                {accounts.map(a => (
                  <Select.Option key={a.id} value={a.id}>
                    <DynamicIcon name={a.icon} size={16} /> {a.name}
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
        label={type === 'refund' ? '退款账户' : '账户'}
        rules={[{ required: true, message: '请选择账户' }]}
      >
        <Select placeholder="请选择账户">
          {accounts.map(a => (
            <Select.Option key={a.id} value={a.id}>
              <DynamicIcon name={a.icon} size={16} /> {a.name}
            </Select.Option>
          ))}
        </Select>
      </Form.Item>
    )
  }

  const renderCategorySelector = () => {
    if (type === 'transfer') {
      return (
       <Form.Item
          name="categoryId"
          label="转账分类"
          extra="选择分类可确定现金流量活动类型（经营/投资/筹资）"
        >
          <TreeSelect
            placeholder="请选择转账分类（可选）"
            allowClear
            treeData={getTypeCategories('transfer')}
            fieldNames={{ label: 'name', value: 'id', children: 'children' }}
          />
        </Form.Item>
      )
    }
    if (type === 'refund') {
      return null
    }

    return (
      <Form.Item
        noStyle
        shouldUpdate={(prevValues, currentValues) => prevValues.type !== currentValues.type}
      >
        {({ getFieldValue }) => {
          const currentType = getFieldValue('type') || type
          return (
            <Form.Item
              name="categoryId"
              label="分类"
              rules={[{ required: true, message: '请选择分类' }]}
            >
              <TreeSelect
                placeholder="请选择分类"
                treeData={getTypeCategories(currentType)}
                fieldNames={{ label: 'name', value: 'id', children: 'children' }}
              />
            </Form.Item>
          )
        }}
      </Form.Item>
    )
  }

  return (
    <>
      {renderRefundSourceInfo()}
      
      <Form.Item
        name="amount"
        label="金额"
        rules={[{ required: true, message: '请输入金额' }]}
      >
        <InputNumber
          style={{ width: '100%' }}
          precision={2}
          min={0.01}
          placeholder="请输入金额"
          prefix="¥"
        />
      </Form.Item>

      {renderAccountSelector()}

      <Form.Item
        name="date"
        label="日期"
        rules={[{ required: true, message: '请选择日期' }]}
        initialValue={dayjs()}
      >
        <DatePicker style={{ width: '100%' }} />
      </Form.Item>

      {renderCategorySelector()}

      <Row gutter={16}>
        <Col span={12}>
          <Form.Item
            name="fee"
            label="手续费"
            initialValue={0}
          >
            <InputNumber
              style={{ width: '100%' }}
              precision={2}
              min={0}
              placeholder="手续费"
              prefix="¥"
            />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item
            name="coupon"
            label="优惠券"
            initialValue={0}
          >
            <InputNumber
              style={{ width: '100%' }}
              precision={2}
              min={0}
              placeholder="优惠券"
              prefix="¥"
            />
          </Form.Item>
        </Col>
      </Row>

      <Form.Item
        name="note"
        label="备注"
      >
        <Input.TextArea rows={2} placeholder="请输入备注" />
      </Form.Item>
    </>
  )
}

export default TransactionForm
