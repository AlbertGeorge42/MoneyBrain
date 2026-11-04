import { Skeleton } from '@mantine/core'

/** 总览加载态：hero 骨架 + 走势骨架 + 流水骨架，只保留一层 live region。 */
export function OverviewLoadingState() {
  return (
    <div className="ov-loading" role="status" aria-busy="true" aria-live="polite">
      <span className="mb-sr-only">正在加载总览…</span>
      <Skeleton className="ov-skeleton-hero" radius="md" />
      <Skeleton className="ov-skeleton-chart" radius="md" />
      <div className="ov-skeleton-list">
        {[0, 1, 2].map((row) => (
          <div className="ov-skeleton-row" key={row}>
            <Skeleton height="100%" radius="sm" />
          </div>
        ))}
      </div>
    </div>
  )
}
