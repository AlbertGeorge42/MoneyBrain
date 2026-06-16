import React, { useState, useEffect } from 'react'
import { Modal, Table, Button, Form, Input, InputNumber, Select, Space, theme, Grid, Dropdown, Tooltip, Empty } from 'antd'
import { PlusOutlined, DeleteOutlined, EditOutlined, SettingOutlined } from '@ant-design/icons'
import type { MenuProps } from 'antd'
import { DndContext, pointerWithin, DragEndEvent } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import { restrictToVerticalAxis } from '@dnd-kit/modifiers'
import { useAccounts } from '../../queries'
import { investmentApi, InvestmentAssetClass } from '../../services/api'
import DynamicIcon from '../../components/common/DynamicIcon'
import { SortableRow, renderDragHandle } from '../../components/settings/shared'
import IconPicker from '../../components/common/IconPicker'
import { useNotify } from '../../hooks/useNotify'
import { formatPercent } from '../../utils/format'

interface Props {
  visible: boolean
  onClose: () => void
  initialAccountId?: string
}

const isSortable = (id: string) => id?.startsWith('asset-class-')
const AssetClassSortableRow = (props: React.ComponentProps<typeof SortableRow>) => <SortableRow isSortable={isSortable} {...props} />

const InvestmentAssetClassConfigModal: React.FC<Props> = ({ visible, onClose, initialAccountId }) => {
  const { token } = theme.useToken()
  const screens = Grid.useBreakpoint()
  const isMobile = !screens.md
  const { data: accounts = [] } = useAccounts()
  const notify = useNotify()

  const [selectedAccountId, setSelectedAccountId] = useState<string | undefined>(initialAccountId)
  const [assetClasses, setAssetClasses] = useState<InvestmentAssetClass[]>([])
  const [loading, setLoading] = useState(false)
  const [editingItem, setEditingItem] = useState<InvestmentAssetClass | null>(null)
  const [formVisible, setFormVisible] = useState(false)
  const [form] = Form.useForm()

  useEffect(() => {
    if (visible && selectedAccountId) {
      loadAssetClasses()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, selectedAccountId])

  useEffect(() => {
    if (initialAccountId) {
      setSelectedAccountId(initialAccountId)
    }
  }, [initialAccountId])

  const investmentAccounts = accounts.filter(a => a.category?.isInvestment === true)

  const loadAssetClasses = async () => {
    if (!selectedAccountId) return
    setLoading(true)
    try {
      const res = await investmentApi.getAssetClasses(selectedAccountId)
      setAssetClasses(res.data.data || [])
    } catch (err) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const errMsg = (err as any)?.response?.data?.error?.message || '加载资产类型失败'
      notify.error(errMsg)
    } finally {
      setLoading(false)
    }
  }

  const handleAdd = () => {
    setEditingItem(null)
    form.resetFields()
    setFormVisible(true)
  }

  const handleEdit = (record: InvestmentAssetClass) => {
    setEditingItem(record)
    form.setFieldsValue({
      name: record.name,
      icon: record.icon,
      targetRatio: record.targetRatio,
    })
    setFormVisible(true)
  }

  const handleDelete = async (id: string) => {
    try {
      await investmentApi.deleteAssetClass(id)
      notify.success('删除成功')
      loadAssetClasses()
    } catch {
      notify.error('删除失败')
    }
  }

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      if (editingItem) {
        await investmentApi.updateAssetClass(editingItem.id, values)
        notify.success('更新成功')
      } else {
        if (!selectedAccountId) {
          notify.error('请先选择投资账户')
          return
        }
        await investmentApi.createAssetClass(selectedAccountId, values)
        notify.success('创建成功')
      }
      setFormVisible(false)
      form.resetFields()
      loadAssetClasses()
    } catch {
      notify.error('操作失败')
    }
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    if (!selectedAccountId) return

    const activeId = String(active.id).replace('asset-class-', '')
    const overId = String(over.id).replace('asset-class-', '')

    const oldIdx = assetClasses.findIndex(a => a.id === activeId)
    const newIdx = assetClasses.findIndex(a => a.id === overId)
    if (oldIdx === -1 || newIdx === -1) return

    const reordered = arrayMove(assetClasses, oldIdx, newIdx)
    setAssetClasses(reordered)

    try {
      await investmentApi.reorderAssetClasses(selectedAccountId, reordered.map(a => a.id))
      notify.success('排序更新成功')
    } catch {
      notify.error('排序更新失败')
      setAssetClasses(assetClasses)
    }
  }

  const targetRatioSum = assetClasses
    .filter(a => a.targetRatio !== null)
    .reduce((sum, a) => sum + (a.targetRatio as number), 0)

  const getSettingMenuItems = (record: InvestmentAssetClass): MenuProps['items'] => [
    { key: 'edit', label: '编辑', icon: <EditOutlined />, onClick: () => handleEdit(record) },
    { type: 'divider' },
    { key: 'delete', label: '删除', icon: <DeleteOutlined />, danger: true, onClick: () => handleDelete(record.id) },
  ]

  const columns = [
    {
      title: '',
      width: 30,
      render: (_: unknown, record: InvestmentAssetClass) => renderDragHandle({ key: `asset-class-${record.id}` }, isSortable),
    },
    {
      title: '图标',
      width: 60,
      render: (_: unknown, record: InvestmentAssetClass) => (
        <DynamicIcon name={record.icon} size={16} fallback="investment" />
      ),
    },
    {
      title: '资产类型名称',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: '预期比例',
      dataIndex: 'targetRatio',
      key: 'targetRatio',
      width: 100,
      render: (value: number | null) => value !== null ? `${value.toFixed(1)}%` : '-',
    },
    {
      title: '操作',
      key: 'action',
      width: 80,
      render: (_: unknown, record: InvestmentAssetClass) => (
        <Dropdown menu={{ items: getSettingMenuItems(record) }} trigger={['click']}>
          <Button type="text" size="small" icon={<SettingOutlined />} />
        </Dropdown>
      ),
    },
  ]

  return (
    <>
      <Modal
        title="投资资产类型配置"
        open={visible}
        onCancel={onClose}
        footer={null}
        width={isMobile ? 'calc(100vw - 24px)' : 720}
        styles={{
          body: {
            maxHeight: '70vh',
            overflowY: 'auto',
          },
        }}
      >
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: token.marginSM,
              flexWrap: 'wrap',
            }}
          >
            <Select
              style={{ width: isMobile ? '100%' : 240 }}
              placeholder="选择投资账户"
              value={selectedAccountId}
              onChange={setSelectedAccountId}
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
            <Tooltip title="添加资产类型">
              <Button type="primary" size="small" icon={<PlusOutlined />} onClick={handleAdd} disabled={!selectedAccountId} />
            </Tooltip>
          </div>

          {selectedAccountId && (
            <>
              <DndContext
                collisionDetection={pointerWithin}
                onDragEnd={handleDragEnd}
                modifiers={[restrictToVerticalAxis]}
              >
                <SortableContext
                  items={assetClasses.map(a => `asset-class-${a.id}`)}
                  strategy={verticalListSortingStrategy}
                >
                  <Table
                    dataSource={assetClasses}
                    columns={columns}
                    rowKey={(record) => `asset-class-${record.id}`}
                    pagination={false}
                    size="small"
                    loading={loading}
                    components={{ body: { row: AssetClassSortableRow } }}
                  />
                </SortableContext>
              </DndContext>

              <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
                <Space>
                  <span style={{ color: token.colorTextSecondary }}>
                    目标比例合计：
                  </span>
                  <span style={{
                    color: targetRatioSum > 100 ? token.colorError :
                          targetRatioSum < 100 ? token.colorWarning : token.colorSuccess,
                    fontWeight: 500,
                  }}>
                    {formatPercent(targetRatioSum, 1, false)}
                  </span>
                  {targetRatioSum < 100 && (
                    <span style={{ color: token.colorTextSecondary, fontSize: token.fontSizeSM }}>
                      （剩余 {formatPercent(100 - targetRatioSum, 1, false)} 视作未配置目标）
                    </span>
                  )}
                  {targetRatioSum > 100 && (
                    <span style={{ color: token.colorError, fontSize: token.fontSizeSM }}>
                      超过100%，无法保存
                    </span>
                  )}
                </Space>
              </Space>
            </>
          )}

          {!selectedAccountId && investmentAccounts.length === 0 && (
            <Empty
              description="暂无投资账户，请先在账户管理中添加投资账户"
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            />
          )}

          {!selectedAccountId && investmentAccounts.length > 0 && (
            <Empty
              description="请先选择一个投资账户"
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            />
          )}
        </Space>
      </Modal>

      <Modal
        title={editingItem ? '编辑资产类型' : '新增资产类型'}
        open={formVisible}
        onCancel={() => setFormVisible(false)}
        onOk={handleSubmit}
        width={isMobile ? 'calc(100vw - 24px)' : 480}
        okButtonProps={{ disabled: targetRatioSum > 100 && !editingItem }}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="name"
            label="名称"
            rules={[{ required: true, message: '请输入名称' }]}
          >
            <Input placeholder="如：股票、债券、货币基金" />
          </Form.Item>
          <Form.Item
            name="icon"
            label="图标"
          >
            <IconPicker />
          </Form.Item>
          <Form.Item
            name="targetRatio"
            label="预期比例（%）"
            rules={[
              { type: 'number', min: 0, max: 100, message: '比例必须在 0-100 之间' },
            ]}
          >
            <InputNumber
              style={{ width: '100%' }}
              min={0}
              max={100}
              precision={1}
              placeholder="如：60 表示 60%"
            />
          </Form.Item>
        </Form>
      </Modal>
    </>
  )
}

export default InvestmentAssetClassConfigModal
