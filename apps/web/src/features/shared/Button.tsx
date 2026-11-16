/**
 * 共享按钮。
 *
 * 只收口原生 `<button>` 的 DOM 契约：默认 `type="button"`、原样透传 ref / disabled /
 * aria-* / data-* 与事件，视觉类名仍由现有 CSS 决定，避免一次性重写 207 处按钮。
 *
 * 变体只登记跨功能复用的视觉族（对应既有 `.mb-*-btn` 类），数值不改：
 * - primary：主操作（`.mb-shared-btn--primary`）
 * - secondary：次操作（`.mb-shared-btn--secondary`）
 * - icon：纯图标（`.mb-shared-icon-btn`）
 * - link：无边框文字按钮（`.mb-shared-link-btn`）
 * 各页面既有的上下文覆盖（如 `.mb-shared-sheet` 下 44px 触控高度、`.mb-shared-bar-reset`
 * 的紧凑内距）继续由原 CSS 与调用方 className 承担，不在组件内统一数值。
 * 其余一次性样式（报表面板、预算行、键盘格子、日期面板等）留在调用方本地类里。
 */
import { forwardRef, type ButtonHTMLAttributes } from 'react'
import './button.css'

type ButtonVariant = 'primary' | 'secondary' | 'icon' | 'link'

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: 'mb-shared-btn--primary',
  secondary: 'mb-shared-btn--secondary',
  icon: 'mb-shared-icon-btn',
  link: 'mb-shared-link-btn',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** 跨功能复用的视觉族；一次性样式留用 className。 */
  variant?: ButtonVariant
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant, className, type = 'button', ...rest },
  ref,
) {
  const base = variant ? VARIANT_CLASS[variant] : ''
  return (
    <button
      {...rest}
      ref={ref}
      type={type}
      className={[base, className].filter(Boolean).join(' ') || undefined}
    />
  )
})
