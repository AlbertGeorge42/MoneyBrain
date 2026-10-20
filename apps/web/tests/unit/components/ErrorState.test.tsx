import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ErrorState } from '../../../src/components/common/ErrorState'
import { ApiClientError } from '../../../src/services/apiError'

describe('ErrorState', () => {
  it('应该展示错误标题与后端消息', () => {
    render(
      <ErrorState
        title="交易列表加载失败"
        error={new ApiClientError({ code: 'INTERNAL_ERROR', message: '数据库连接失败' })}
      />
    )

    expect(screen.getByText('交易列表加载失败')).toBeInTheDocument()
    expect(screen.getByText('数据库连接失败')).toBeInTheDocument()
  })

  it('应该展示请求 ID 便于定位日志', () => {
    render(
      <ErrorState
        error={new ApiClientError({ code: 'INTERNAL_ERROR', message: '出错了', requestId: 'req-77' })}
      />
    )

    expect(screen.getByText(/请求 ID：req-77/)).toBeInTheDocument()
  })

  it('点击重试应该调用回调', async () => {
    const onRetry = vi.fn()
    render(<ErrorState error={new Error('出错了')} onRetry={onRetry} />)

    // antd 会在两个中文字符之间插入空格，因此用宽松匹配
    await userEvent.click(screen.getByRole('button', { name: /重\s*试/ }))

    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('没有重试回调时不应该显示重试按钮', () => {
    render(<ErrorState error={new Error('出错了')} />)

    expect(screen.queryByRole('button', { name: /重\s*试/ })).not.toBeInTheDocument()
  })

  it('inline 形态应该展示为提示条', () => {
    render(
      <ErrorState
        variant="inline"
        title="净资产加载失败"
        error={new ApiClientError({ code: 'INTERNAL_ERROR', message: '服务不可用' })}
      />
    )

    expect(screen.getByText('净资产加载失败')).toBeInTheDocument()
    expect(screen.getByText('服务不可用')).toBeInTheDocument()
  })
})
