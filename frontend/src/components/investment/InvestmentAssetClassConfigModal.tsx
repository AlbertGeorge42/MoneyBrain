import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { Modal, Table, Form, Input, InputNumber, Empty, theme } from 'antd'
import { PlusOutlined, DeleteOutlined, EditOutlined, WalletOutlined, ExclamationCircleOutlined } from '@ant-design/icons'
import type { MenuProps } from 'antd'
import { DndContext, pointerWithin, DragEndEvent } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import { restrictToVerticalAxis } from '@dnd-kit/modifiers'
import { useAccounts } from '../../queries'
import { investmentApi } from '../../services/api'
import CategoryIcon from '../../components/common/CategoryIcon'
import { SortableRow, SettingDropdown, renderExpandIcon, renderDragHandle, useSortableTable } from '../../components/settings/shared'
import ConfigModalLayout from '../../components/settings/ConfigModalLayout'
import { default as IconColorField } from '../../components/common/Picker'
import { useNotify } from '../../hooks/useNotify'

interface Props {
  visible: boolean
  onClose: () => void
}

// 树形节点类型
interface InvestmentTreeNode {
  id: string
  key: string
  name: string
  icon: string | null
  color?: string | null
  type: 'account' | 'assetClass'
  accountId?: string // 资产类型所属的账户ID
  targetRatio?: number | null // 资产类型的预期比例
  sort: number
  children?: InvestmentTreeNode[]
  depth: number
}

// 只有资产类型行可排序
const isSortable = (id: string) => id?.startsWith('assetClass-')
const InvestmentSortableRow = (props: React.ComponentProps<typeof SortableRow>) => <SortableRow isSortable={isSortable} {...props} />

const InvestmentAssetClassConfigModal: React.FC<Props> = ({ visible, onClose }) => {
  const { token } = theme.useToken()
  const notify = useNotify()
  const { data: accounts = [] } = useAccounts()

  const [treeData, setTreeData] = useState<InvestmentTreeNode[]>([])
  const [loading, setLoading] = useState(false)
  const [editingItem, setEditingItem] = useState<InvestmentTreeNode | null>(null)
  const [addingAccountId, setAddingAccountId] = useState<string | null>(null)
  const [formVisible, setFormVisible] = useState(false)
  const [form] = Form.useForm()

  const { sensors, expandedRowKeys, setExpandedRowKeys, toggleExpand, getVisibleSortableKeys } = useSortableTable()

  // 获取投资账户列表
  const investmentAccounts = useMemo(() => {
    return accounts.filter(a => a.category?.isInvestment === true).sort((a, b) => a.sort - b.sort)
  }, [accounts])

  // 加载所有投资账户的资产类型数据
  const loadAllAssetClasses = useCallback(async () => {
    if (investmentAccounts.length === 0) {
      setTreeData([])
      return
    }

    setLoading(true)
    try {
      // 并行获取所有投资账户的资产类型
      const results = await Promise.all(
        investmentAccounts.map(async (account) => {
          try {
            const res = await investmentApi.getAssetClasses(account.id)
            const assetClasses = res.data.data || []
            return { accountId: account.id, assetClasses }
          } catch {
            return { accountId: account.id, assetClasses: [] }
          }
        })
      )

      // 构建树形数据
      const tree: InvestmentTreeNode[] = investmentAccounts.map((account) => {
        const accountResult = results.find(r => r.accountId === account.id)
        const assetClasses = accountResult?.assetClasses || []

        const children: InvestmentTreeNode[] = assetClasses
          .sort((a, b) => a.sort - b.sort)
          .map((ac) => ({
            id: ac.id,
            key: `assetClass-${ac.id}`,
            name: ac.name,
            icon: ac.icon,
            color: ac.color ?? null,
            type: 'assetClass' as const,
            accountId: account.id,
            targetRatio: ac.targetRatio,
            sort: ac.sort,
            depth: 1,
          }))

        return {
          id: account.id,
          key: `account-${account.id}`,
          name: account.name,
          icon: account.icon,
          color: account.color ?? null,
          type: 'account' as const,
          sort: account.sort,
          children: children.length > 0 ? children : undefined,
          depth: 0,
        }
      })

      setTreeData(tree)
      // 默认展开所有账户
      setExpandedRowKeys(tree.map(t => t.key))
    } catch {
      notify.error('加载资产类型失败')
    } finally {
      setLoading(false)
    }
  }, [investmentAccounts, notify, setExpandedRowKeys])

  useEffect(() => {
    if (visible) {
      loadAllAssetClasses()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible])

  // 添加资产类型
  const handleAdd = (accountId: string) => {
    setEditingItem(null)
    setAddingAccountId(accountId)
    form.resetFields()
    setFormVisible(true)
  }

  // 编辑资产类型
  const handleEdit = (record: InvestmentTreeNode) => {
    if (record.type !== 'assetClass') return
    setEditingItem(record)
    setAddingAccountId(null)
    form.setFieldsValue({
      name: record.name,
      icon: record.icon,
      color: record.color,
      targetRatio: record.targetRatio,
    })
    setFormVisible(true)
  }

  // 删除资产类型
  const handleDelete = async (record: InvestmentTreeNode) => {
    if (record.type !== 'assetClass') return

    try {
      const result = await investmentApi.deleteAssetClass(record.id)

      // 如果需要二次确认，显示确认弹窗
      if (result.data.data?.needConfirm && result.data.data.snapshotsCount) {
        Modal.confirm({
          title: '确认删除',
          icon: <ExclamationCircleOutlined />,
          content: (
            <div>
              <p>该资产类型已被 {result.data.data.snapshotsCount} 条快照引用</p>
              <p style={{ marginTop: 8, color: 'var(--ant-color-warning)' }}>
                强制删除将同时删除相关的快照记录，此操作不可恢复。
              </p>
            </div>
          ),
          okText: '强制删除',
          okType: 'danger',
          cancelText: '取消',
          onOk: async () => {
            try {
              const forceResult = await investmentApi.deleteAssetClass(record.id, true)
              if (forceResult.data.data?.deletedSnapshots) {
                notify.success(`删除成功，已删除 ${forceResult.data.data.deletedSnapshots} 条快照记录`)
              } else {
                notify.success('删除成功')
              }
              loadAllAssetClasses()
            } catch (forceError: unknown) {
              const forceMessage = forceError instanceof Error ? forceError.message : '删除失败'
              notify.error(forceMessage)
            }
          },
        })
      } else {
        // 直接删除成功
        notify.success('删除成功')
        loadAllAssetClasses()
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '删除失败'
      notify.error(message)
    }
  }

  // 提交表单
  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      if (editingItem) {
        await investmentApi.updateAssetClass(editingItem.id, values)
        notify.success('更新成功')
      } else if (addingAccountId) {
        await investmentApi.createAssetClass(addingAccountId, values)
        notify.success('创建成功')
      }
      setFormVisible(false)
      form.resetFields()
      loadAllAssetClasses()
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '操作失败'
      notify.error(message)
    }
  }

  // 拖拽排序（只支持同一账户下的资产类型排序）
  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const activeKey = String(active.id)
    const overKey = String(over.id)

    // 只有资产类型行可排序
    if (!activeKey.startsWith('assetClass-') || !overKey.startsWith('assetClass-')) {
      notify.warning('只能调整同一账户下的资产类型顺序')
      return
    }

    const activeId = activeKey.replace('assetClass-', '')
    const overId = overKey.replace('assetClass-', '')

    // 找到所属账户
    const findAccountForAssetClass = (assetClassId: string): string | null => {
      for (const node of treeData) {
        if (node.children?.some(c => c.id === assetClassId)) {
          return node.id
        }
      }
      return null
    }

    const activeAccountId = findAccountForAssetClass(activeId)
    const overAccountId = findAccountForAssetClass(overId)

    if (!activeAccountId || !overAccountId || activeAccountId !== overAccountId) {
      notify.warning('只能在同一账户下调整资产类型顺序')
      return
    }

    // 找到该账户下的资产类型列表
    const accountNode = treeData.find(t => t.id === activeAccountId)
    if (!accountNode?.children) return

    const assetClasses = accountNode.children
    const oldIdx = assetClasses.findIndex(a => a.id === activeId)
    const newIdx = assetClasses.findIndex(a => a.id === overId)
    if (oldIdx === -1 || newIdx === -1) return

    const reordered = arrayMove(assetClasses, oldIdx, newIdx)

    // 更新本地状态
    setTreeData(prev => prev.map(t => {
      if (t.id === activeAccountId) {
        return {
          ...t,
          children: reordered.map((a, i) => ({ ...a, sort: i })),
        }
      }
      return t
    }))

    try {
      await investmentApi.reorderAssetClasses(activeAccountId, reordered.map(a => a.id))
      notify.success('排序更新成功')
    } catch {
      notify.error('排序更新失败')
      loadAllAssetClasses()
    }
  }

  // 计算每个账户的目标比例合计
  const getAccountRatioSum = (accountId: string): number => {
    const accountNode = treeData.find(t => t.id === accountId)
    if (!accountNode?.children) return 0
    return accountNode.children
      .filter(a => a.targetRatio !== null)
      .reduce((sum, a) => sum + (a.targetRatio as number), 0)
  }

  // 获取行菜单项
  const getSettingMenuItems = (record: InvestmentTreeNode): MenuProps['items'] => {
    if (record.type === 'account') {
      // 账户行：只显示"添加资产类型"
      return [
        {
          key: 'add-asset-class',
          label: '添加资产类型',
          icon: <PlusOutlined />,
          onClick: () => handleAdd(record.id),
        },
      ]
    } else {
      // 资产类型行：编辑、删除
      return [
        { key: 'edit', label: '编辑', icon: <EditOutlined />, onClick: () => handleEdit(record) },
        { type: 'divider' },
        { key: 'delete', label: '删除', icon: <DeleteOutlined />, danger: true, onClick: () => handleDelete(record) },
      ]
    }
  }

  // 表格列定义
  const columns = [
    {
      title: '',
      width: 30,
      render: (_: unknown, record: InvestmentTreeNode) =>
        renderExpandIcon(record, expandedRowKeys, toggleExpand, token.colorTextSecondary, `${token.fontSizeSM}px`),
    },
    {
      title: '',
      width: 30,
      render: (_: unknown, record: InvestmentTreeNode) =>
        renderDragHandle(record, isSortable),
    },
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
      render: (text: string, record: InvestmentTreeNode) => (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <CategoryIcon
            name={record.icon}
            color={record.color ?? null}
            size={22}
            iconSize={12}
            fallback={record.type === 'account' ? 'wallet' : 'investment'}
          />
          {' '}{text}
          {record.type === 'account' && (
            <span style={{ color: token.colorTextTertiary, fontSize: token.fontSizeSM, marginLeft: 8 }}>
              ({record.children?.length || 0} 个资产类型)
            </span>
          )}
        </span>
      ),
    },
    {
      title: '预期比例',
      dataIndex: 'targetRatio',
      key: 'targetRatio',
      width: 100,
      render: (value: number | null, record: InvestmentTreeNode) => {
        if (record.type === 'account') {
          // 账户行显示合计
          const sum = getAccountRatioSum(record.id)
          return (
            <span style={{
              color: sum > 100 ? token.colorError :
                    sum < 100 && record.children?.length ? token.colorWarning :
                    sum === 100 && record.children?.length ? token.colorSuccess :
                    token.colorTextTertiary,
              fontWeight: 500,
            }}>
              {record.children?.length ? `${sum.toFixed(1)}%` : '-'}
            </span>
          )
        }
        return value !== null ? `${value.toFixed(1)}%` : '-'
      },
    },
    {
      title: '操作',
      key: 'action',
      width: 80,
      render: (_: unknown, record: InvestmentTreeNode) => (
        <SettingDropdown items={getSettingMenuItems(record)} />
      ),
    },
  ]

  // 空状态
  const emptyContent = investmentAccounts.length === 0 ? (
    <Empty
      description="暂无投资账户，请先在账户管理中添加投资账户"
      image={Empty.PRESENTED_IMAGE_SIMPLE}
    />
  ) : null

  // 表格内容
  const tableContent = treeData.length > 0 ? (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragEnd={handleDragEnd}
      modifiers={[restrictToVerticalAxis]}
    >
      <SortableContext
        items={getVisibleSortableKeys(treeData)}
        strategy={verticalListSortingStrategy}
      >
        <Table
          dataSource={treeData}
          columns={columns}
          rowKey="key"
          pagination={false}
          size="small"
          loading={loading}
          indentSize={20}
          expandedRowKeys={expandedRowKeys}
          onExpandedRowsChange={(keys) => setExpandedRowKeys(keys as string[])}
          expandable={{
            rowExpandable: (r) => r.type === 'account' && !!r.children?.length,
            expandIcon: () => null,
          }}
          components={{ body: { row: InvestmentSortableRow } }}
        />
      </SortableContext>
    </DndContext>
  ) : emptyContent

  const tabItems = [
    { key: 'asset-classes', label: '资产类型', children: tableContent },
  ]

  // 计算当前编辑/添加的账户的比例合计（用于表单验证）
  const currentAccountId = editingItem?.accountId || addingAccountId
  const currentRatioSum = currentAccountId ? getAccountRatioSum(currentAccountId) : 0

  return (
    <>
      <ConfigModalLayout
        title="投资资产类型配置"
        visible={visible}
        onClose={onClose}
        tabs={{ items: tabItems }}
      />
      <Modal
        title={editingItem ? '编辑资产类型' : '新增资产类型'}
        open={formVisible}
        onCancel={() => setFormVisible(false)}
        onOk={handleSubmit}
        width={480}
        okButtonProps={{
          disabled: !editingItem && currentRatioSum >= 100,
        }}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="name"
            label="名称"
            rules={[{ required: true, message: '请输入名称' }]}
          >
            <Input placeholder="如：股票、债券、货币基金" />
          </Form.Item>
          <Form.Item label="图标与颜色" style={{ marginBottom: 0 }}>
            <IconColorField form={form} />
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
        {!editingItem && currentRatioSum >= 100 && (
          <div style={{ color: token.colorError, marginBottom: 16 }}>
            该账户的预期比例已达到 100%，无法继续添加
          </div>
        )}
        {currentAccountId && (
          <div style={{ color: token.colorTextTertiary, marginBottom: 16 }}>
            <WalletOutlined style={{ marginRight: 8 }} />
            当前账户：{investmentAccounts.find(a => a.id === currentAccountId)?.name}
            {' '}(目标比例合计：{currentRatioSum.toFixed(1)}%)
          </div>
        )}
      </Modal>
    </>
  )
}

export default InvestmentAssetClassConfigModal