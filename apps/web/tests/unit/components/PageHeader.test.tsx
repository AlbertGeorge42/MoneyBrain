import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import PageHeader from '../../../src/components/common/PageHeader'

describe('PageHeader', () => {
  it('应该渲染标题', () => {
    render(<PageHeader title="测试标题" />)
    expect(screen.getByText('测试标题')).toBeInTheDocument()
  })

  it('应该渲染 eyebrow 文本', () => {
    render(<PageHeader eyebrow="Overview" title="测试标题" />)
    expect(screen.getByText('Overview')).toBeInTheDocument()
  })

  it('应该渲染描述文本', () => {
    render(<PageHeader title="测试标题" description="这是描述" />)
    expect(screen.getByText('这是描述')).toBeInTheDocument()
  })

  it('应该渲染操作按钮', () => {
    render(
      <PageHeader
        title="测试标题"
        actions={<button>操作按钮</button>}
      />
    )
    expect(screen.getByText('操作按钮')).toBeInTheDocument()
  })

  it('无 eyebrow 时不应该渲染 eyebrow 元素', () => {
    const { container } = render(<PageHeader title="测试标题" />)
    expect(container.querySelector('.page-header__eyebrow')).not.toBeInTheDocument()
  })

  it('无 description 时不应该渲染描述元素', () => {
    const { container } = render(<PageHeader title="测试标题" />)
    expect(container.querySelector('.page-header__description')).not.toBeInTheDocument()
  })
})
