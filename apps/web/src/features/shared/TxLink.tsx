/**
 * 交易跳转链接（原交易 ⇄ 退款双向同一实现）。
 *
 * 不用 accent 色表达可点：accent 在本项目是黄绿色，会和收入色混淆，
 * 也让跳转在详情里过于抢眼。改用中性文字 + 虚线下划线 + 外链箭头表达"可跳转"，
 * hover 时文字转 primary、下划线转实线，颜色语义保持中性。
 */
import { ArrowUpRight } from 'lucide-react'
import { Button } from './Button'
import './txLink.css'

export function TxLink({
  children,
  onClick,
  className = '',
  onKeyDown,
}: {
  children: React.ReactNode
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void
  className?: string
  /** 嵌在可点容器内时阻止按键冒泡（如流水行的 Enter 打开本行详情）。 */
  onKeyDown?: (event: React.KeyboardEvent<HTMLButtonElement>) => void
}) {
  return (
    <Button
      variant="text"
      className={`mb-shared-tx-link ${className}`}
      onClick={onClick}
      onKeyDown={onKeyDown}
    >
      {children}
      <ArrowUpRight size={13} strokeWidth={1.8} aria-hidden="true" />
    </Button>
  )
}
