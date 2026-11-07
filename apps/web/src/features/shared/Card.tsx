/**
 * 共享卡片外壳。
 *
 * 总览/预算/流水的曲面卡、报表卡、冷启动/错误面板三套外壳此前各自声明一遍
 * 边框、底色、圆角与阴影；这里收成一个组件 + 一份 CSS，差异用变体表达：
 * - surface：flex 纵排 + 12px 间距，圆角 --mb-radius-md（14px）
 * - report：块级排版，圆角与 surface 同走 --mb-radius-md（14px）
 * - state：flex 纵排、顶部对齐；tone="danger" 用错误面板外壳并追加左侧语义边
 *
 * 所有变体都只输出原有类名，不改任何数值；业务类（如 .mb-tx-list-card）继续覆盖差异。
 */
import type { HTMLAttributes } from 'react'
import './card.css'

type CardVariant = 'surface' | 'report' | 'state'

export interface CardProps extends HTMLAttributes<HTMLElement> {
  variant?: CardVariant
  /** 仅 state 变体：danger 追加左侧危险语义边。 */
  tone?: 'danger'
  /** 骨架屏等非语义包裹用 div。 */
  as?: 'section' | 'div'
  /** 允许把 data-* 透传给原生元素（如预算分组的 data-type）。 */
  [dataAttribute: `data-${string}`]: string | number | boolean | undefined
}

export function Card({
  variant = 'surface',
  tone,
  as: Tag = 'section',
  className,
  children,
  ...rest
}: CardProps) {
  const shell =
    variant === 'report'
      ? 'mb-rp-card'
      : variant === 'state'
        ? tone === 'danger'
          ? 'mb-errorpanel'
          : 'mb-coldstart'
        : 'mb-card'
  return (
    <Tag className={className ? `${shell} ${className}` : shell} {...rest}>
      {children}
    </Tag>
  )
}
