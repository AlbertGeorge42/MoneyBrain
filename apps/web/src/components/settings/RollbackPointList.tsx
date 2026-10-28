import { Button, Empty, Popconfirm, Space, Tag, Typography } from 'antd'
import { HistoryOutlined, RollbackOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { useDeleteRollbackPoint, useRestoreRollbackPoint, useRollbackPoints } from '../../queries/data'
import { useNotify } from '../../hooks/useNotify'
import { getApiErrorMessage } from '../../services/apiError'
import { BACKUP_DATA_TYPE_LABELS, type BackupDataType } from '@contracts/constants'

/**
 * 回滚点列表：覆盖导入前服务端自动留的整库快照。
 */
export function RollbackPointList() {
  const notify = useNotify()
  const { data: points, isLoading } = useRollbackPoints()
  const restore = useRestoreRollbackPoint()
  const remove = useDeleteRollbackPoint()

  if (isLoading) {
    return <Typography.Text type="secondary">回滚点加载中…</Typography.Text>
  }

  if (!points || points.length === 0) {
    return (
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description="暂无回滚点"
      />
    )
  }

  const handleRestore = (id: string) => {
    restore.mutate(id, {
      onSuccess: () => notify.success('已回滚到该回滚点'),
      onError: (error) => notify.error(getApiErrorMessage(error, '回滚失败，请重试')),
    })
  }

  return (
    <div className="rollback-point-list">
      {points.map((point) => (
        <div key={point.id} className="rollback-point-item">
          <div className="rollback-point-item__info">
            <Space size={8} wrap>
              <HistoryOutlined />
              <span>{dayjs(point.createdAt).format('YYYY-MM-DD HH:mm:ss')}</span>
              <Tag>{point.reason}</Tag>
            </Space>
            <div className="rollback-point-item__meta">
              覆盖范围：
              {point.includes.map((key) => BACKUP_DATA_TYPE_LABELS[key as BackupDataType] ?? key).join('、')}
              {' · '}
              {(point.sizeBytes / 1024 / 1024).toFixed(1)} MB
            </div>
          </div>
          <Space size={8}>
            <Button
              size="small"
              icon={<RollbackOutlined />}
              loading={restore.isPending && restore.variables === point.id}
              onClick={() => handleRestore(point.id)}
            >
              回滚
            </Button>
            <Popconfirm
              title="删除这个回滚点？"
              description="删除后无法回到该时间点"
              okText="删除"
              cancelText="取消"
              okButtonProps={{ danger: true }}
              onConfirm={() =>
                remove.mutate(point.id, {
                  onSuccess: () => notify.success('回滚点已删除'),
                  onError: (error) => notify.error(getApiErrorMessage(error, '删除失败，请重试')),
                })
              }
            >
              <Button size="small" danger loading={remove.isPending && remove.variables === point.id}>
                删除
              </Button>
            </Popconfirm>
          </Space>
        </div>
      ))}
    </div>
  )
}
