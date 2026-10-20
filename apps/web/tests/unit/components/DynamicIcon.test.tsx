import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import DynamicIcon from '../../../src/components/common/DynamicIcon'

describe('DynamicIcon', () => {
  it('应该渲染有效的 lucide 图标', () => {
    const { container } = render(<DynamicIcon name="home" />)
    expect(container.querySelector('svg')).toBeInTheDocument()
  })

  it('应该支持自定义尺寸', () => {
    const { container } = render(<DynamicIcon name="home" size={24} />)
    const svg = container.querySelector('svg')
    expect(svg).toBeInTheDocument()
    expect(svg?.getAttribute('width')).toBe('24')
    expect(svg?.getAttribute('height')).toBe('24')
  })

  it('应该支持自定义 className', () => {
    const { container } = render(<DynamicIcon name="home" className="custom-class" />)
    expect(container.querySelector('.custom-class')).toBeInTheDocument()
  })

  it('null name 应该渲染 fallback 图标', () => {
    const { container } = render(<DynamicIcon name={null} />)
    expect(container.querySelector('svg')).toBeInTheDocument()
  })

  it('undefined name 应该渲染 fallback 图标', () => {
    const { container } = render(<DynamicIcon name={undefined} />)
    expect(container.querySelector('svg')).toBeInTheDocument()
  })

  it('emoji 名称应该渲染 fallback 图标', () => {
    const { container } = render(<DynamicIcon name="😀" />)
    expect(container.querySelector('svg')).toBeInTheDocument()
  })

  it('无效图标名应该渲染 fallback 图标', () => {
    const { container } = render(<DynamicIcon name="non-existent-icon" />)
    expect(container.querySelector('svg')).toBeInTheDocument()
  })

  it('应该支持自定义 fallback', () => {
    const { container } = render(<DynamicIcon name={null} fallback="star" />)
    expect(container.querySelector('svg')).toBeInTheDocument()
  })
})
