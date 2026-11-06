/**
 * 预算进度条结构与行为守护（HF 第四批）
 *
 * 断到结构/行为：level → 填充 token 映射、neutral 无填充且无刻度缺口、
 * over 单段条面跨过 100% 缺口、100% 停在缺口左侧、0–130% 刻度位置。
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

/** 100 / 130 —— 100% 预算刻度在轨道上的位置。 */
const TICK_LEFT = (100 / 130) * 100

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

  it('neutral 不渲染填充段，也不渲染 100% 刻度缺口（整条保持单一轨道色）', () => {
    const { container } = render(<BudgetProgress level="neutral" percent={0} label="账户互转" />)

    expect(container.querySelector('.mb-progress-fill')).toBeNull()
    expect(container.querySelector('.mb-progress-tick')).toBeNull()
  })

  it('over 是单段条面，连续跨过 100% 缺口（不再拼接第二段）', () => {
    const { container } = render(<BudgetProgress level="over" percent={118} label="购物" />)

    const fills = container.querySelectorAll<HTMLElement>('.mb-progress-fill')
    const tick = container.querySelector<HTMLElement>('.mb-progress-tick')
    expect(fills).toHaveLength(1)
    expect(parseFloat(fills[0].style.width)).toBeCloseTo((118 / 130) * 100, 3)
    expect(parseFloat(fills[0].style.width)).toBeGreaterThan(TICK_LEFT)
    expect(tick).not.toBeNull()
  })

  it('100% 的条面停在缺口左侧；warning / achieved 都不产生第二段', () => {
    for (const level of ['warning', 'achieved'] as const) {
      const { container, unmount } = render(
        <BudgetProgress level={level} percent={100} label="测试预算" />,
      )
      const fill = container.querySelector<HTMLElement>('.mb-progress-fill')
      expect(parseFloat(fill?.style.width ?? '0')).toBeCloseTo(TICK_LEFT, 5)
      expect(container.querySelector('.mb-progress-tick')).not.toBeNull()
      expect(container.querySelectorAll('.mb-progress-fill')).toHaveLength(1)
      unmount()
    }
  })

  it('超支超过 130% 时钳在轨道右端', () => {
    const { container } = render(<BudgetProgress level="over" percent={150} label="购物" />)
    const fill = container.querySelector<HTMLElement>('.mb-progress-fill')
    expect(parseFloat(fill?.style.width ?? '0')).toBeCloseTo(100, 5)
  })
})
