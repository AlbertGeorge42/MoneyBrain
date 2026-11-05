/**
 * 预算进度条结构与行为守护（HF 第四批）
 *
 * 断到结构/行为：level → 填充 token 映射、neutral 无填充且无 headroom、
 * over 渲染溢出段、warning 不渲染溢出段、0–130% 刻度位置。
 */
import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import {
  BudgetProgress,
  type BudgetProgressLevel,
} from '@/features/shared/BudgetProgress'

const LEVEL_TO_TOKEN: Record<Exclude<BudgetProgressLevel, 'neutral'>, string> = {
  normal: 'var(--mb-progress-normal)',
  warning: 'var(--mb-progress-warning)',
  over: 'var(--mb-progress-over)',
  achieved: 'var(--mb-progress-achieved)',
}

describe('BudgetProgress', () => {
  it('每个 level 的填充段绑定对应 token', () => {
    for (const [level, token] of Object.entries(LEVEL_TO_TOKEN) as [
      Exclude<BudgetProgressLevel, 'neutral'>,
      string,
    ][]) {
      const { container, unmount } = render(
        <BudgetProgress level={level} percent={80} label="测试预算" />,
      )
      const fill = container.querySelector<HTMLElement>('.mb-progress-fill')
      expect(fill?.style.background).toBe(token)
      expect(container.querySelector('.mb-progress')?.getAttribute('data-level')).toBe(level)
      unmount()
    }
  })

  it('neutral 不渲染填充段，也不渲染 headroom（整条保持单一轨道色）', () => {
    const { container } = render(<BudgetProgress level="neutral" percent={0} label="账户互转" />)

    expect(container.querySelector('.mb-progress-fill')).toBeNull()
    expect(container.querySelector('.mb-progress-headroom')).toBeNull()
    expect(container.querySelector('.mb-progress-spill')).toBeNull()
  })

  it('over 渲染从 100% 刻度处长出的溢出段', () => {
    const { container } = render(<BudgetProgress level="over" percent={120} label="购物" />)

    const fill = container.querySelector<HTMLElement>('.mb-progress-fill')
    const spill = container.querySelector<HTMLElement>('.mb-progress-spill')
    expect(fill?.style.width).toBe('76.92307692307693%')
    expect(spill).not.toBeNull()
    expect(parseFloat(spill?.style.left ?? '0')).toBeCloseTo(76.923, 3)
    expect(parseFloat(spill?.style.width ?? '0')).toBeCloseTo((20 / 130) * 100, 3)
  })

  it('warning / achieved 不渲染溢出段', () => {
    for (const level of ['warning', 'achieved'] as const) {
      const { container, unmount } = render(
        <BudgetProgress level={level} percent={100} label="测试预算" />,
      )
      expect(container.querySelector('.mb-progress-spill')).toBeNull()
      unmount()
    }
  })
})
