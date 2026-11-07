/**
 * 共享按钮。
 *
 * 只收口原生 `<button>` 的 DOM 契约：默认 `type="button"`、原样透传 ref / disabled /
 * aria-* / data-* 与事件，视觉类名仍由现有 CSS 决定，避免一次性重写 207 处按钮。
 *
 * 变体只登记跨功能复用的视觉族（对应既有 `.mb-*-btn` 类），数值不改：
 * - link：无边框文字按钮（`.mb-link-btn`）
 * 其余一次性样式（卡片整行、键盘格子、日期面板等）留在调用方的本地类里，
 * 由 `className` 传入并继续覆盖，不在组件内新增变体。
 */
import { forwardRef, type ButtonHTMLAttributes } from 'react'

type HfButtonVariant = 'link'

const VARIANT_CLASS: Record<HfButtonVariant, string> = {
  link: 'mb-link-btn',
}

export interface HfButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** 跨功能复用的视觉族；一次性样式留用 className。 */
  variant?: HfButtonVariant
}

export const HfButton = forwardRef<HTMLButtonElement, HfButtonProps>(function HfButton(
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
