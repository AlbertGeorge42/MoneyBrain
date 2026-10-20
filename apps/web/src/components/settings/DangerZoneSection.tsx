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

  // 清空交易数据 - 中度危险
  const showClearTransactionsConfirm = () => {
    Modal.confirm({
      title: '清空交易数据',
      icon: <ExclamationCircleOutlined />,
      okText: '确认清空',
      okType: 'danger',
      cancelText: '取消',
      onOk: handleClearTransactions,
      content: (
        <p style={{ color: token.colorTextSecondary, margin: 0 }}>
          将删除所有交易记录和预算数据，账户与分类不受影响。
        </p>
      ),
    })
  }

  // 清空全部数据 - 极度危险，需输入确认
  const showClearAllConfirm = () => {
    let confirmValue = ''

    Modal.confirm({
      title: '清空全部数据',
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
          <p style={{ color: token.colorError, fontWeight: 600, margin: `0 0 ${token.paddingSM}px 0` }}>
            不可恢复：将删除账户、分类、交易、预算等所有数据。
          </p>
          <p style={{ color: token.colorTextTertiary, margin: `0 0 ${token.paddingXS}px 0` }}>
            输入 <strong style={{ color: token.colorError }}>DELETE</strong> 以确认：
          </p>
          <Input
            placeholder="DELETE"
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

      {/* 清空交易数据 - 中度危险：danger 默认变体（红框红字） */}
      <div className="danger-action">
        <div>
          <h3 className="danger-action__title">清空交易数据</h3>
          <p className="danger-action__desc">
            永久删除所有交易记录与预算数据，账户和分类会保留。
          </p>
        </div>
        <Button
          danger
          icon={<DeleteOutlined />}
          onClick={showClearTransactionsConfirm}
        >
          清空交易数据
        </Button>
      </div>

      <Divider style={{ margin: `${token.paddingLG}px 0`, borderColor: token.colorBorderSecondary }} />

      {/* 清空全部数据 - 极度危险：danger primary（实底红） */}
      <div className="danger-action">
        <div>
          <h3 className="danger-action__title">清空全部数据</h3>
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
