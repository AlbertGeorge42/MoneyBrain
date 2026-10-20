import { Alert, Button, Result, Space } from 'antd'
import { getApiErrorMessage, getApiErrorRequestId } from '../../services/apiError'

export interface ErrorStateProps {
  /** 错误标题 */
  title?: string
  /** 原始异常对象，通常直接传 query 的 error */
  error?: unknown
  /** 重试回调；不传则不显示重试按钮 */
  onRetry?: () => void
  /** block=整块占位；inline=紧凑提示条（用于卡片/表格局部） */
  variant?: 'block' | 'inline'
  className?: string
}

/**
 * 统一的查询失败展示。
 *
 * 约定：接口失败时绝不能退化成 0 或空列表，
 * 必须把「加载失败 + 原因 + 重试入口」显式展示给用户。
 */
export function ErrorState({
  title = '数据加载失败',
  error,
  onRetry,
  variant = 'block',
  className,
}: ErrorStateProps) {
  const message = getApiErrorMessage(error)
  const requestId = getApiErrorRequestId(error)

  const detail = (
    <Space orientation="vertical" size={2}>
      <span>{message}</span>
      {requestId && (
        <span style={{ fontSize: 12, opacity: 0.7 }}>请求 ID：{requestId}</span>
      )}
    </Space>
  )

  if (variant === 'inline') {
    return (
      <Alert
        type="error"
        showIcon
        className={className}
        message={title}
        description={detail}
        action={onRetry ? <Button size="small" onClick={onRetry}>重试</Button> : undefined}
      />
    )
  }

  return (
    <Result
      status="error"
      className={className}
      title={title}
      subTitle={detail}
      extra={onRetry ? <Button type="primary" onClick={onRetry}>重试</Button> : undefined}
    />
  )
}
