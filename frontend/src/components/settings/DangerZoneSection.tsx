import React from 'react'
import { Card, Button, Alert, Modal, Input, Divider, theme } from 'antd'
import { DeleteOutlined, ExclamationCircleOutlined } from '@ant-design/icons'
import { useClearTransactions, useClearAll } from '../../queries'
import { useNotify } from '../../hooks/useNotify'

const DangerZoneSection: React.FC = () => {
  const { token } = theme.useToken()
  const notify = useNotify()
  const clearTransactionsMutation = useClearTransactions()
  const clearAllMutation = useClearAll()

  const handleClearTransactions = async () => {
    try {
      await clearTransactionsMutation.mutateAsync()
      notify.success('交易数据已清空')
    } catch {
      notify.error('清空交易数据失败')
    }
  }

  const handleClearData = async () => {
    try {
      await clearAllMutation.mutateAsync()
      notify.success('所有数据已清空')
    } catch {
      notify.error('清空数据失败')
    }
  }

  const showClearTransactionsConfirm = () => {
    Modal.confirm({
      title: '确认清空交易数据',
      icon: <ExclamationCircleOutlined />,
      okText: '确认清空',
      okType: 'danger',
      cancelText: '取消',
      onOk: handleClearTransactions,
      content: (
        <div>
          <p className="danger-text-danger">
            这会永久删除所有交易记录与预算数据。
          </p>
          <p className="danger-text-safe">账户和分类会保留。</p>
          <p className="danger-text-hint">建议先导出备份，再执行该操作。</p>
        </div>
      ),
    })
  }

  // 清空全部数据：要求输入 DELETE 确认
  const showClearAllConfirm = () => {
    let confirmValue = ''

    Modal.confirm({
      title: '确认清空全部数据',
      icon: <ExclamationCircleOutlined />,
      okText: '确认清空',
      okType: 'danger',
      cancelText: '取消',
      onOk: () => {
        if (confirmValue !== 'DELETE') {
          notify.error('请输入 DELETE 确认操作')
          return Promise.reject()
        }
        return handleClearData()
      },
      content: (
        <div>
          <p className="danger-text-danger">
            这会删除账户、分类、交易、预算和余额快照，且不可恢复。
          </p>
          <p className="danger-text-hint" style={{ marginBottom: token.paddingSM }}>
            请输入 <strong style={{ color: 'var(--mb-color-danger)' }}>DELETE</strong> 以确认：
          </p>
          <Input
            placeholder="输入 DELETE"
            onChange={(e) => { confirmValue = e.target.value }}
          />
        </div>
      ),
    })
  }

  return (
    <Card className="surface-card danger-zone" title="危险操作">
      <Alert
        title="执行前建议先导出备份"
        type="warning"
        showIcon
        style={{ marginBottom: token.padding }}
      />

      {/* 清空交易数据 - 中度危险 */}
      <div className="danger-action">
        <div>
          <h3 className="danger-action__title" style={{ color: 'var(--mb-color-warning)' }}>清空交易数据</h3>
          <p className="danger-action__desc">
            永久删除所有交易记录与预算数据，账户和分类会保留。
          </p>
        </div>
        <Button
          ghost
          icon={<DeleteOutlined />}
          onClick={showClearTransactionsConfirm}
          className="danger-btn-warning"
        >
          清空交易数据
        </Button>
      </div>

      <Divider style={{ margin: `${token.paddingLG}px 0`, borderColor: 'var(--mb-color-border-subtle)' }} />

      {/* 清空全部数据 - 极度危险 */}
      <div className="danger-action">
        <div>
          <h3 className="danger-action__title" style={{ color: 'var(--mb-color-danger)' }}>清空全部数据</h3>
          <p className="danger-action__desc">
            删除账户、分类、交易、预算等所有数据，且不可恢复。
          </p>
        </div>
        <Button
          type="primary"
          danger
          icon={<DeleteOutlined />}
          onClick={showClearAllConfirm}
        >
          清空全部数据
        </Button>
      </div>
    </Card>
  )
}

export default DangerZoneSection
