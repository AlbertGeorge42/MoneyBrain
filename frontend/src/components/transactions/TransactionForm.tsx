import React, { useEffect, useState } from 'react'
import { Form, Input, Select, InputNumber, DatePicker, Row, Col, TreeSelect, Tag, Space, theme, Spin } from 'antd'
import dayjs from 'dayjs'
import { Account, TransactionCategory, Transaction, accountApi } from '../../services/api'
import { buildSortedTree as buildTreeData } from '@shared/utils/tree'
import DynamicIcon from '../common/DynamicIcon'
import { formatCurrency } from '../../utils/format'

export type TransactionFormType = 'expense' | 'income' | 'transfer' | 'refund' | 'adjustment'

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
  /** 账户余额变化回调（仅在 adjustment 类型使用） */
  onAccountBalanceChange?: (balance: number | null) => void
}

const TransactionForm: React.FC<TransactionFormProps> = ({
  type,
  editingTransaction,
  accounts,
  categories,
  form,
  showRefundSourceInfo = false,
  sourceTransaction = null,
  onAccountBalanceChange,
}) => {
  const { token } = theme.useToken()
  const colorTextMuted = token.colorTextTertiary
  const colorIncome = 'var(--mb-color-income)'
  const colorExpense = 'var(--mb-color-expense)'
  const colorBgHover = token.controlItemBgHover || token.colorBgTextHover
  const fontSizeCaption = `${token.fontSizeSM}px`
  const radiusControl = `${token.borderRadiusSM}px`
  const spaceCardPadding = `${token.padding}px`

  // adjustment 类型：账户余额相关状态
  const [accountBalance, setAccountBalance] = useState<number | null>(null)
  const [loadingBalance, setLoadingBalance] = useState(false)

  // 监听账户选择变化（用于 adjustment 类型）
  const watchedAccountId = Form.useWatch('accountId', form)

  // 获取账户当前余额（用于 adjustment 类型）
  useEffect(() => {
    if (type === 'adjustment' && watchedAccountId) {
      setLoadingBalance(true)
      accountApi.getBalanceAt(watchedAccountId, dayjs().format('YYYY-MM-DD'))
        .then(res => {
          const balance = res.data.data?.balance ?? null
          setAccountBalance(balance)
          onAccountBalanceChange?.(balance)

          // 编辑 adjustment 类型时，反向计算"当前金额"
          // 当前金额 = 当前余额 + 原始平账值
          if (editingTransaction && balance !== null) {
            const currentAmount = balance + editingTransaction.amount
            form.setFieldValue('amount', currentAmount)
          }
        })
        .catch(() => {
          setAccountBalance(null)
          onAccountBalanceChange?.(null)
        })
        .finally(() => {
          setLoadingBalance(false)
        })
    } else if (type === 'adjustment' && !watchedAccountId) {
      setAccountBalance(null)
      onAccountBalanceChange?.(null)
    }
  }, [type, watchedAccountId, onAccountBalanceChange, editingTransaction, form])

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
      <div style={{ marginBottom: spaceCardPadding, padding: 12, backgroundColor: colorBgHover, borderRadius: radiusControl }}>
        <div style={{ color: colorTextMuted, fontSize: fontSizeCaption, marginBottom: spaceCardPadding }}>原交易</div>
        <Space>
          <Tag style={{ color: sourceTransaction.type === 'income' ? colorIncome : colorExpense, borderColor: sourceTransaction.type === 'income' ? colorIncome : colorExpense, backgroundColor: 'transparent' }}>
            {sourceTransaction.type === 'income' ? '收入' : '支出'}
          </Tag>
          {sourceTransaction.category?.icon && <DynamicIcon name={sourceTransaction.category.icon} size={16} />}
          {sourceTransaction.category?.name || '未分类'} - {formatCurrency(sourceTransaction.amount)}
          <span style={{ color: colorTextMuted }}>({dayjs(sourceTransaction.date).format('YYYY-MM-DD')})</span>
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
                {accounts.map(a => (
                  <Select.Option key={a.id} value={a.id}>
                    <DynamicIcon name={a.icon} size={16} /> {a.name}
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
        extra={type === 'adjustment' && (
          loadingBalance ? <Spin size="small" /> :
          accountBalance !== null ? `当前余额: ${formatCurrency(accountBalance)}` : null
        )}
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
    // refund 和 adjustment 不需要分类选择
    if (type === 'refund' || type === 'adjustment') {
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

      {/* adjustment 类型：先选择账户，再输入金额 */}
      {type === 'adjustment' && renderAccountSelector()}

      <Form.Item
        name="amount"
        label={type === 'adjustment' ? '当前金额' : '金额'}
        rules={[{ required: true, message: type === 'adjustment' ? '请输入当前金额' : '请输入金额' }]}
        extra={type === 'adjustment' && accountBalance !== null && (
          <Form.Item noStyle shouldUpdate>
            {({ getFieldValue }) => {
              const currentAmount = getFieldValue('amount')
              if (currentAmount !== undefined && currentAmount !== null) {
                const adjustmentValue = currentAmount - accountBalance
                const color = adjustmentValue >= 0 ? colorIncome : colorExpense
                return (
                  <div style={{ marginTop: 8 }}>
                    平账值: <span style={{ color, fontWeight: 500 }}>{formatCurrency(adjustmentValue)}</span>
                    <span style={{ color: colorTextMuted, marginLeft: 8 }}>
                      ({adjustmentValue >= 0 ? '增加' : '减少'}账户余额)
                    </span>
                  </div>
                )
              }
              return null
            }}
          </Form.Item>
        )}
      >
        <InputNumber
          style={{ width: '100%' }}
          precision={2}
          min={type === 'adjustment' ? undefined : 0.01}
          placeholder={type === 'adjustment' ? '请输入账户当前实际金额（负债账户可为负数）' : '请输入金额'}
          prefix="¥"
        />
      </Form.Item>

      {/* 其他类型：先输入金额，再选择账户 */}
      {type !== 'adjustment' && renderAccountSelector()}

      <Form.Item
        name="date"
        label="日期"
        rules={[{ required: true, message: '请选择日期' }]}
        initialValue={dayjs()}
      >
        <DatePicker style={{ width: '100%' }} />
      </Form.Item>

      {renderCategorySelector()}

      {/* adjustment 类型不需要手续费和优惠券 */}
      {type !== 'adjustment' && (
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
      )}

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
