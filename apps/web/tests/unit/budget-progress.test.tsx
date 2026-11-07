/**
 * 预算进度条结构与行为守护（HF 第四批）
 *
 * 断到结构/行为：level → 填充 token 映射、绿 = 良好（normal 与 achieved 同值）、
 * 收入进行中用 neutral 钢色、转账 neutral 无填充无刻度缺口、
 * over 单段条面跨过 100% 缺口且有 6px 红段保底、100% 停在缺口左侧。
 */
import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import fs from 'node:fs'
import path from 'node:path'
import {
  BudgetProgress,
  type BudgetProgressLevel,
} from '@/features/shared/BudgetProgress'

const LEVEL_TO_TOKEN: Record<Exclude<BudgetProgressLevel, 'neutral'>, string> = {
  normal: 'var(--mb-progress-normal)',
  warning: 'var(--mb-progress-warning)',
  over: 'var(--mb-progress-over)',
  achieved: 'var(--mb-progress-normal)',
}

/** 100 / 130 —— 100% 预算刻度在轨道上的位置。 */
const TICK_LEFT = (100 / 130) * 100
/** 超支保底宽度：100% 位 + 2px 缺口 + 6px 红段。 */
const OVER_MIN = 'calc(76.9231% + 8px)'

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

  it('normal 与 achieved 是同一个绿，不再留第二套绿', () => {
    const normal = render(<BudgetProgress level="normal" percent={40} label="餐饮" />)
    const achieved = render(<BudgetProgress level="achieved" percent={100} label="工资" />)
    const normalFill = normal.container.querySelector<HTMLElement>('.mb-progress-fill')
    const achievedFill = achieved.container.querySelector<HTMLElement>('.mb-progress-fill')
    expect(normalFill?.style.background).toBe('var(--mb-progress-normal)')
    expect(achievedFill?.style.background).toBe('var(--mb-progress-normal)')
  })

  it('收入进行中（neutralFill）画钢色条，不是绿', () => {
    const { container } = render(
      <BudgetProgress level="neutral" percent={62} label="工资还差 ¥7,030.00" neutralFill />,
    )

    const fill = container.querySelector<HTMLElement>('.mb-progress-fill')
    expect(fill?.style.background).toBe('var(--mb-progress-neutral)')
    expect(parseFloat(fill?.style.width ?? '0')).toBeCloseTo((62 / 130) * 100, 3)
    expect(container.querySelector('.mb-progress-tick')).not.toBeNull()
  })

  it('转账 neutral 不渲染填充段，也不渲染 100% 刻度缺口（整条保持单一轨道色）', () => {
    const { container } = render(<BudgetProgress level="neutral" percent={0} label="账户互转" />)

    expect(container.querySelector('.mb-progress-fill')).toBeNull()
    expect(container.querySelector('.mb-progress-tick')).toBeNull()
  })

  it('over 是单段条面，连续跨过 100% 缺口（不再拼接第二段）', () => {
    const { container } = render(<BudgetProgress level="over" percent={118} label="购物" />)

    const fills = container.querySelectorAll<HTMLElement>('.mb-progress-fill')
    const tick = container.querySelector<HTMLElement>('.mb-progress-tick')
    expect(fills).toHaveLength(1)
    expect(fills[0].classList.contains('is-over')).toBe(true)
    expect(fills[0].style.getPropertyValue('--mb-fill-width')).toBe(`${(118 / 130) * 100}%`)
    expect(fills[0].style.getPropertyValue('--mb-over-min')).toBe(OVER_MIN)
    expect(fills[0].style.background).toBe('var(--mb-progress-over)')
    expect(tick).not.toBeNull()
  })

  it('101% 也留出缺口与 6px 红段（超支宽度有保底）', () => {
    const { container } = render(<BudgetProgress level="over" percent={101} label="购物" />)

    const fill = container.querySelector<HTMLElement>('.mb-progress-fill')
    expect(fill?.classList.contains('is-over')).toBe(true)
    expect(fill?.style.getPropertyValue('--mb-fill-width')).toBe(`${(101 / 130) * 100}%`)
    expect(fill?.style.getPropertyValue('--mb-over-min')).toBe(OVER_MIN)
  })

  it('100% 的条面停在缺口左侧；warning / achieved 都不产生保底红段', () => {
    for (const level of ['warning', 'achieved'] as const) {
      const { container, unmount } = render(
        <BudgetProgress level={level} percent={100} label="测试预算" />,
      )
      const fill = container.querySelector<HTMLElement>('.mb-progress-fill')
      expect(parseFloat(fill?.style.width ?? '0')).toBeCloseTo(TICK_LEFT, 5)
      expect(fill?.classList.contains('is-over')).toBe(false)
      expect(container.querySelector('.mb-progress-tick')).not.toBeNull()
      expect(container.querySelectorAll('.mb-progress-fill')).toHaveLength(1)
      unmount()
    }
  })

  it('超支超过 130% 时钳在轨道右端', () => {
    const { container } = render(<BudgetProgress level="over" percent={150} label="购物" />)
    const fill = container.querySelector<HTMLElement>('.mb-progress-fill')
    // 超过 130% 时真实宽度已大于保底，max() 取 100%。
    expect(fill?.style.getPropertyValue('--mb-fill-width')).toBe('100%')
    expect(fill?.style.getPropertyValue('--mb-over-min')).toBe(OVER_MIN)
  })
})

describe('进度条口径与 token 落地', () => {
  // vitest 的工作目录是 apps/web，仓库根在上两级。
  const repoRoot = path.resolve(process.cwd(), '../..')
  const read = (relative: string) => fs.readFileSync(path.join(repoRoot, relative), 'utf8')
  const tokensDoc = read('docs/blueprint/ux/design-tokens.md')
  const specDoc = read('docs/blueprint/ux/interaction-spec.md')
  const themeVars = read('apps/web/src/styles/theme/hf-theme.ts')
  const progressCss = read('apps/web/src/features/shared/budgetProgress.css')

  it('§2.7 与 §6.2 不再残留「对轨道 ≥3:1」旧口径', () => {
    const tokenSection = tokensDoc.slice(tokensDoc.indexOf('### 2.7'), tokensDoc.indexOf('### 2.8'))
    const specSection = specDoc.slice(specDoc.indexOf('## 6. 预算'), specDoc.indexOf('## 7.'))
    expect(tokenSection.length).toBeGreaterThan(100)
    expect(specSection.length).toBeGreaterThan(100)
    expect(tokenSection).not.toContain('≥3:1')
    expect(specSection).not.toContain('≥3:1')
  })

  it('新口径与 neutral / track token 写进文档', () => {
    expect(tokensDoc).toContain('≥1.6 明度比且 ΔE00 ≥20')
    expect(tokensDoc).toContain('--mb-progress-neutral')
    expect(tokensDoc).toContain('--mb-progress-track')
    expect(specDoc).toContain('--mb-progress-neutral')
  })

  it('轨道不再借用 border-strong，超支用 max() 取 6px 保底', () => {
    expect(progressCss).toContain('var(--mb-progress-track)')
    expect(progressCss).not.toContain('border-strong')
    expect(progressCss).toContain('max(var(--mb-fill-width), var(--mb-over-min))')
  })

  it('两套绿已合并：没有 achieved token，normal 仍是唯一绿', () => {
    expect(themeVars).not.toContain('--mb-progress-achieved')
    expect(themeVars.match(/--mb-progress-normal/g)?.length).toBe(2)
  })
})
