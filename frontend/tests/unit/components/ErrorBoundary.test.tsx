import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import ErrorBoundary from '../../../src/components/common/ErrorBoundary'

// Mock window.location.reload
const mockReload = vi.fn()
Object.defineProperty(window, 'location', {
  value: { reload: mockReload },
  writable: true,
})

// 创建一个会抛出错误的组件
const ThrowError = () => {
  throw new Error('测试错误')
}

describe('ErrorBoundary', () => {
  it('应该正常渲染子组件', () => {
    render(
      <ErrorBoundary>
        <div>正常内容</div>
      </ErrorBoundary>
    )
    expect(screen.getByText('正常内容')).toBeInTheDocument()
  })

  it('子组件抛出错误时应该显示错误界面', () => {
    // 抑制控制台错误输出
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    render(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>
    )

    expect(screen.getByText('页面出错了')).toBeInTheDocument()
    expect(screen.getByText('请刷新页面重试')).toBeInTheDocument()
    expect(screen.getByText('刷新页面')).toBeInTheDocument()

    consoleSpy.mockRestore()
  })

  it('点击刷新按钮应该调用 location.reload', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockReload.mockClear()

    render(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>
    )

    screen.getByText('刷新页面').click()
    expect(mockReload).toHaveBeenCalled()

    consoleSpy.mockRestore()
  })
})
