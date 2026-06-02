import React, { useState, useEffect } from 'react'
import { Modal, Select, DatePicker, Table, InputNumber, Space, message, theme, Alert, Typography, Spin, Grid, Card } from 'antd'
import { useStore } from '../../stores'
import { investmentApi, accountApi, InvestmentAssetClass, InvestmentAllocationSnapshot } from '../../services/api'
import DynamicIcon from '../../components/common/DynamicIcon'
import dayjs from 'dayjs'

interface Props {
  visible: boolean
  onClose: () => void
  onSuccess: () => void
  initialAccountId?: string
  editingSnapshot?: InvestmentAllocationSnapshot | null
}

const { Text } = Typography

const InvestmentSnapshotModal: React.FC<Props> = ({ visible, onClose, onSuccess, initialAccountId, editingSnapshot }) => {
  const { token } = theme.useToken()
  const screens = Grid.useBreakpoint()
  const isMobile = !screens.md
  const { accounts, fetchAccounts } = useStore()

  const isEditMode = !!editingSnapshot

  const [selectedAccountId, setSelectedAccountId] = useState<string | undefined>(initialAccountId)
  const [selectedDate, setSelectedDate] = useState<dayjs.Dayjs | null>(dayjs())
  const [assetClasses, setAssetClasses] = useState<InvestmentAssetClass[]>([])
  const [previousSnapshot, setPreviousSnapshot] = useState<InvestmentAllocationSnapshot | null>(null)
  const [accountBalance, setAccountBalance] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [balanceLoading, setBalanceLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const [items, setItems] = useState<Array<{
    assetClassId: string
    name: string
    icon: string | null
    targetRatio: number | null
    marketValue: number
    periodNetFlow: number
  }>>([])

  useEffect(() => {
    if (visible) {
      fetchAccounts()
      if (editingSnapshot) {
        setSelectedAccountId(editingSnapshot.accountId)
        setSelectedDate(dayjs(editingSnapshot.date))
      }
    } else {
      setAccountBalance(null)
      setItems([])
      setPreviousSnapshot(null)
      setAssetClasses([])
      setSelectedAccountId(initialAccountId)
      setSelectedDate(dayjs())
    }
  }, [visible, editingSnapshot])

  useEffect(() => {
    setAccountBalance(null)
  }, [selectedAccountId])

  useEffect(() => {
    if (visible && selectedAccountId) {
      loadAssetClasses()
    }
  }, [visible, selectedAccountId])

  useEffect(() => {
    if (visible && selectedAccountId && selectedDate) {
      loadPreviousSnapshot()
      loadAccountBalance()
    }
  }, [visible, selectedAccountId, selectedDate])

  useEffect(() => {
    if (initialAccountId && !editingSnapshot) {
      setSelectedAccountId(initialAccountId)
    }
  }, [initialAccountId, editingSnapshot])

  const investmentAccounts = accounts.filter(a => a.category?.isInvestment === true)

  const loadAssetClasses = async () => {
    if (!selectedAccountId) return
    setLoading(true)
    try {
      const res = await investmentApi.getAssetClasses(selectedAccountId)
      const classes = res.data.data || []
      setAssetClasses(classes)
      
      if (editingSnapshot) {
        setItems(classes.map(c => {
          const existingItem = editingSnapshot.items.find(i => i.assetClassId === c.id)
          return {
            assetClassId: c.id,
            name: c.name,
            icon: c.icon,
            targetRatio: c.targetRatio,
            marketValue: existingItem?.marketValue ?? 0,
            periodNetFlow: existingItem?.periodNetFlow ?? 0,
          }
        }))
      } else {
        setItems(classes.map(c => ({
          assetClassId: c.id,
          name: c.name,
          icon: c.icon,
          targetRatio: c.targetRatio,
          marketValue: 0,
          periodNetFlow: 0,
        })))
      }
    } catch (error: any) {
      message.error(error.response?.data?.error?.message || '加载资产类型失败')
    } finally {
      setLoading(false)
    }
  }

  const loadPreviousSnapshot = async () => {
    if (!selectedAccountId || !selectedDate) return
    if (isEditMode) return
    
    try {
      const res = await investmentApi.getLatestSnapshot(selectedAccountId, selectedDate.format('YYYY-MM-DD'))
      const snapshot = res.data.data ?? null
      setPreviousSnapshot(snapshot)

      if (snapshot && snapshot.items.length > 0) {
        setItems(prev => prev.map(item => {
          const prevItem = snapshot.items.find(i => i.assetClassId === item.assetClassId)
          return prevItem ? {
            ...item,
            marketValue: prevItem.marketValue,
          } : item
        }))
      }
    } catch (error: any) {
      console.error('加载上一条快照失败', error)
    }
  }

  const loadAccountBalance = async () => {
    if (!selectedAccountId || !selectedDate) return
    setBalanceLoading(true)
    try {
      const res = await accountApi.getBalanceAt(selectedAccountId, selectedDate.format('YYYY-MM-DD'))
      setAccountBalance(res.data.data?.balance ?? null)
    } catch (error: any) {
      console.error('加载账户余额失败', error)
      setAccountBalance(null)
    } finally {
      setBalanceLoading(false)
    }
  }

  const isEarliestSnapshot = isEditMode ? false : !previousSnapshot

  const totalMarketValue = items.reduce((sum, item) => sum + item.marketValue, 0)
  const totalNetFlow = items.reduce((sum, item) => sum + item.periodNetFlow, 0)
  const difference = accountBalance !== null ? accountBalance - totalMarketValue : null
  const isValidBalance = difference !== null && Math.abs(difference) <= 0.01

  const handleItemChange = (assetClassId: string, field: string, value: number) => {
    setItems(prev => prev.map(item =>
      item.assetClassId === assetClassId ? { ...item, [field]: value } : item
    ))
  }

  const handleSave = async () => {
    if (!selectedAccountId || !selectedDate) {
      message.error('请选择账户和日期')
      return
    }

    if (assetClasses.length === 0) {
      message.error('请先在设置中添加资产类型')
      return
    }

    setSaving(true)
    try {
      const snapshotData = {
        date: selectedDate.format('YYYY-MM-DD'),
        items: items.map((item) => ({
          assetClassId: item.assetClassId,
          marketValue: item.marketValue,
          periodNetFlow: isEarliestSnapshot ? 0 : item.periodNetFlow,
        })),
      }

      if (isEditMode && editingSnapshot) {
        await investmentApi.updateSnapshot(editingSnapshot.id, snapshotData)
        message.success('快照更新成功')
      } else {
        await investmentApi.saveSnapshot({
          accountId: selectedAccountId,
          ...snapshotData,
        })
        message.success('快照保存成功')
      }
      
      onSuccess()
      onClose()
    } catch (error: any) {
      message.error(error.response?.data?.error?.message || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const columns = [
    {
      title: '资产类型',
      dataIndex: 'name',
      key: 'name',
      width: 120,
      render: (name: string, record: typeof items[0]) => (
        <span>
          <DynamicIcon name={record.icon} size={16} fallback="investment" />
          {' '}{name}
        </span>
      ),
    },
    {
      title: '当前金额',
      key: 'marketValue',
      width: 120,
      render: (_: unknown, record: typeof items[0]) => (
        <InputNumber
          value={record.marketValue}
          onChange={(value) => handleItemChange(record.assetClassId, 'marketValue', value || 0)}
          precision={2}
          style={{ width: '100%' }}
          size="small"
        />
      ),
    },
    {
      title: '期间净流入',
      key: 'periodNetFlow',
      width: 120,
      render: (_: unknown, record: typeof items[0]) => (
        <InputNumber
          value={isEarliestSnapshot ? 0 : record.periodNetFlow}
          onChange={(value) => handleItemChange(record.assetClassId, 'periodNetFlow', value || 0)}
          precision={2}
          style={{ width: '100%' }}
          size="small"
          disabled={isEarliestSnapshot}
        />
      ),
    },
    {
      title: '占比',
      key: 'ratio',
      width: 70,
      render: (_: unknown, record: typeof items[0]) => {
        const ratio = totalMarketValue > 0 ? (record.marketValue / totalMarketValue) * 100 : 0
        return <Text>{ratio.toFixed(1)}%</Text>
      },
    },
    {
      title: '目标偏差',
      key: 'deviation',
      width: 80,
      render: (_: unknown, record: typeof items[0]) => {
        if (record.targetRatio === null) return <Text type="secondary">-</Text>
        const ratio = totalMarketValue > 0 ? (record.marketValue / totalMarketValue) * 100 : 0
        const deviation = ratio - record.targetRatio
        return (
          <Text style={{ color: Math.abs(deviation) > 5 ? token.colorError : token.colorSuccess }}>
            {deviation >= 0 ? '+' : ''}{deviation.toFixed(1)}%
          </Text>
        )
      },
    },
  ]

  const renderMobileItemCard = (item: typeof items[0]) => {
    const ratio = totalMarketValue > 0 ? (item.marketValue / totalMarketValue) * 100 : 0
    const deviation = item.targetRatio !== null ? ratio - item.targetRatio : null

    return (
      <Card
        key={item.assetClassId}
        size="small"
        style={{ marginBottom: token.marginSM }}
      >
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: token.marginSM }}>
          <DynamicIcon name={item.icon} size={16} fallback="investment" />
          <Text strong style={{ marginLeft: 8 }}>{item.name}</Text>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: token.marginSM }}>
          <div>
            <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>当前金额</Text>
            <InputNumber
              value={item.marketValue}
              onChange={(value) => handleItemChange(item.assetClassId, 'marketValue', value || 0)}
              precision={2}
              style={{ width: '100%', marginTop: 4 }}
              size="small"
            />
          </div>
          <div>
            <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>占比</Text>
            <div style={{ marginTop: 4 }}><Text>{ratio.toFixed(1)}%</Text></div>
          </div>
          <div style={{ gridColumn: 'span 2' }}>
            <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>期间净流入（正数投入，负数转出）</Text>
            <InputNumber
              value={isEarliestSnapshot ? 0 : item.periodNetFlow}
              onChange={(value) => handleItemChange(item.assetClassId, 'periodNetFlow', value || 0)}
              precision={2}
              style={{ width: '100%', marginTop: 4 }}
              size="small"
              disabled={isEarliestSnapshot}
            />
          </div>
        </div>
        {item.targetRatio !== null && (
          <div style={{ marginTop: token.marginSM }}>
            <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>目标偏差：</Text>
            <Text style={{
              color: deviation !== null && Math.abs(deviation) > 5 ? token.colorError : token.colorSuccess
            }}>
              {deviation !== null ? `${deviation >= 0 ? '+' : ''}${deviation.toFixed(1)}%` : '-'}
            </Text>
          </div>
        )}
      </Card>
    )
  }

  const summarySection = (
    <div style={{
      background: token.colorBgContainer,
      padding: token.paddingSM,
      borderRadius: token.borderRadius,
      marginTop: token.margin,
    }}>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: token.marginSM }}>
        <div>
          <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>账户余额</Text>
          <div style={{ marginTop: 4 }}>
            {balanceLoading ? <Spin size="small" /> : (
              <Text strong>{accountBalance !== null ? accountBalance.toFixed(2) : '--'}</Text>
            )}
          </div>
        </div>
        <div>
          <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>已录入金额</Text>
          <div style={{ marginTop: 4 }}><Text strong>{totalMarketValue.toFixed(2)}</Text></div>
        </div>
        <div>
          <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>差额</Text>
          <div style={{ marginTop: 4 }}>
            <Text strong style={{ color: isValidBalance ? token.colorSuccess : token.colorWarning }}>
              {difference !== null ? difference.toFixed(2) : '-'}
            </Text>
            {!isValidBalance && difference !== null && (
              <Text type="warning" style={{ fontSize: token.fontSizeSM, marginLeft: 8 }}>
                (未分类)
              </Text>
            )}
          </div>
        </div>
      </div>
    </div>
  )

  return (
    <Modal
      title={isEditMode ? '编辑快照' : '新增快照'}
      open={visible}
      onCancel={onClose}
      onOk={handleSave}
      okButtonProps={{
        loading: saving,
        disabled: accountBalance === null || assetClasses.length === 0,
      }}
      width={isMobile ? 'calc(100vw - 24px)' : 720}
      styles={{
        body: {
          maxHeight: '70vh',
          overflowY: 'auto',
        },
      }}
    >
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : 'minmax(220px, 1fr) 160px',
          gap: token.marginSM,
        }}>
          <Select
            style={{ width: '100%' }}
            placeholder="选择投资账户"
            value={selectedAccountId}
            onChange={setSelectedAccountId}
            disabled={isEditMode}
            options={investmentAccounts.map(a => ({
              value: a.id,
              label: (
                <span>
                  <DynamicIcon name={a.icon} size={16} fallback="wallet" />
                  {' '}{a.name}
                </span>
              ),
            }))}
          />
          <DatePicker
            value={selectedDate}
            onChange={(date) => setSelectedDate(date)}
            style={{ width: '100%' }}
          />
        </div>

        {isEarliestSnapshot && selectedAccountId && !isEditMode && (
          <Alert
            message="该记录将作为初始值，不计算本期收益率"
            type="info"
            showIcon
          />
        )}

        {assetClasses.length === 0 && selectedAccountId && (
          <Alert
            message="请先在设置中添加资产类型"
            type="warning"
            showIcon
          />
        )}

        {assetClasses.length > 0 && (
          <>
            {isMobile ? (
              <>
                <div style={{ maxHeight: '50vh', overflowY: 'auto' }}>
                  {items.map(renderMobileItemCard)}
                </div>
                {summarySection}
              </>
            ) : (
              <>
                <Table
                  dataSource={items}
                  columns={columns}
                  rowKey="assetClassId"
                  pagination={false}
                  size="small"
                  loading={loading}
                  scroll={{ x: 600 }}
                  summary={() => (
                    <Table.Summary fixed>
                      <Table.Summary.Row>
                        <Table.Summary.Cell index={0}>
                          <Text strong>合计</Text>
                        </Table.Summary.Cell>
                        <Table.Summary.Cell index={1}>
                          <Text strong>{totalMarketValue.toFixed(2)}</Text>
                        </Table.Summary.Cell>
                        <Table.Summary.Cell index={2}>
                          <Text strong>{totalNetFlow.toFixed(2)}</Text>
                        </Table.Summary.Cell>
                        <Table.Summary.Cell index={3}>
                          <Text strong>100%</Text>
                        </Table.Summary.Cell>
                        <Table.Summary.Cell index={4}>
                          <Text type="secondary">-</Text>
                        </Table.Summary.Cell>
                      </Table.Summary.Row>
                    </Table.Summary>
                  )}
                />

                <Space style={{ width: '100%', justifyContent: 'space-between', flexWrap: 'wrap' }}>
                  <Space>
                    <Text type="secondary">账户余额：</Text>
                    {balanceLoading ? <Spin size="small" /> : (
                      <Text strong>{accountBalance !== null ? accountBalance.toFixed(2) : '--'}</Text>
                    )}
                  </Space>
                  <Space>
                    <Text type="secondary">已录入：</Text>
                    <Text strong>{totalMarketValue.toFixed(2)}</Text>
                  </Space>
                  <Space>
                    <Text type="secondary">差额：</Text>
                    <Text strong style={{ color: isValidBalance ? token.colorSuccess : token.colorWarning }}>
                      {difference !== null ? difference.toFixed(2) : '-'}
                    </Text>
                    {!isValidBalance && difference !== null && (
                      <Text type="warning" style={{ fontSize: token.fontSizeSM }}>
                        （将作为"未分类"）
                      </Text>
                    )}
                  </Space>
                </Space>
              </>
            )}
          </>
        )}
      </Space>
    </Modal>
  )
}

export default InvestmentSnapshotModal
