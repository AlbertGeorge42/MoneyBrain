/**
 * 共享按钮：跨 feature 单一实现。
 *
 * DOM 契约：默认 type="button"，原样透传 ref / disabled / aria-* / data-* 与事件。
 * 视觉统一在 button.css，差异用明确 props 表达，不再由各 feature 复制基础样式：
 * - variant：primary / secondary / ghost / danger / danger-solid / clear / toggle / link
 * - size：md（默认）/ sm
 * - pressed：toggle 激活态（输出 aria-pressed 驱动激活样式）
 * - armed：danger 待确认态
 * - boxed：link 的带边框命中区变体（原 settings 的 textbtn--boxed）
 * Mantine Button（Modal 内）用 mb-shared-btn--* 类名对齐视觉，不重复实现设计。
 */
import { forwardRef, type ButtonHTMLAttributes } from 'react'
import './button.css'

type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'ghost'
  | 'danger'
  | 'danger-solid'
  | 'clear'
  | 'toggle'
  | 'link'

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: 'mb-shared-btn--primary',
  secondary: 'mb-shared-btn--secondary',
  ghost: 'mb-shared-btn--ghost',
  danger: 'mb-shared-btn--danger',
  'danger-solid': 'mb-shared-btn--danger-solid',
  clear: 'mb-shared-btn--clear',
  toggle: 'mb-shared-btn--toggle',
  link: 'mb-shared-link-btn',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** 视觉族；省略则用调用方 className 决定（兼容历史一次性样式）。 */
  variant?: ButtonVariant
  size?: 'md' | 'sm'
  /** toggle 激活态，输出 aria-pressed。 */
  pressed?: boolean
  /** danger 待确认态。 */
  armed?: boolean
  /** link 的带边框命中区变体。 */
  boxed?: boolean
  /** link 嵌在说明文字后时补行内间距。 */
  inline?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant, size, pressed, armed, boxed, inline, className, type = 'button', ...rest },
  ref,
) {
  const classes = [
    // 基类提供 flex 居中与统一排版；variant 在 CSS 中位于其后，仅覆盖视觉。
    // 缺了基类时带图标的按钮会退化为 inline-block 的基线对齐，图标与文字错位。
    'mb-shared-btn',
    variant ? VARIANT_CLASS[variant] : '',
    boxed && variant === 'link' ? 'mb-shared-link-btn--boxed' : '',
    inline && variant === 'link' ? 'mb-shared-link-btn--inline' : '',
    size === 'sm' ? 'mb-shared-btn--sm' : '',
    armed ? 'is-armed' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')
  const ariaPressed = variant === 'toggle' ? pressed ?? false : rest['aria-pressed']
  return (
    <button
      {...rest}
      ref={ref}
      type={type}
      aria-pressed={ariaPressed}
      className={classes || undefined}
    />
  )
})
