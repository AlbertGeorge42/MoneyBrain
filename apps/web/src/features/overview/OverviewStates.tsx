import { Skeleton } from '@mantine/core'
import { TransactionLoadingState } from '../transactions/TransactionStates'

/** 总览加载态：hero 骨架 + 走势骨架 + 流水骨架，避免整页闪白。 */
export function OverviewLoadingState() {
  return (
    <div className="ov-loading" role="status" aria-busy="true" aria-live="polite">
      <span className="mb-sr-only">正在加载总览…</span>
      <Skeleton className="ov-skeleton-hero" radius="md" />
      <Skeleton className="ov-skeleton-chart" radius="md" />
      <TransactionLoadingState />
    </div>
  )
}
