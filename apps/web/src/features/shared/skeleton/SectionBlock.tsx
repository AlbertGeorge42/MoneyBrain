import type { ReactNode } from 'react'
import './skeleton.css'

interface SectionBlockProps {
  title?: ReactNode
  /** 分区标题右侧的动作。 */
  actions?: ReactNode
  children: ReactNode
}

/**
 * 分区：分区标题与内容的间距。
 * 标题字号、间距与卡片内距见 docs/blueprint/ux/page-skeleton.md §2.4。
 */
export function SectionBlock({ title, actions, children }: SectionBlockProps) {
  return (
    <section className="mb-section-block" data-skeleton="section-block">
      {title ? (
        <div className="mb-section-head">
          <h2 className="mb-section-title">{title}</h2>
          {actions ? <div className="mb-section-actions">{actions}</div> : null}
        </div>
      ) : null}
      <div className="mb-section-body">{children}</div>
    </section>
  )
}
