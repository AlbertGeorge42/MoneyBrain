import { forwardRef, type ButtonHTMLAttributes } from 'react'
import './iconButton.css'

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** sm=32px 常规；md=44px 触控目标（shell/移动端）。 */
  size?: 'sm' | 'md'
}

/**
 * 图标按钮：跨 feature 单一实现（原 mb-rp-iconbtn / mb-dp-iconbtn /
 * mb-set-icon-btn / shell 的 mb-shared-icon-btn 四套同构）。
 * 调用方必须提供 aria-label（图标本身无文字）。
 */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { size = 'sm', className, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      {...rest}
      ref={ref}
      type={type}
      className={['mb-shared-iconbtn', `mb-shared-iconbtn--${size}`, className]
        .filter(Boolean)
        .join(' ')}
    />
  )
})
