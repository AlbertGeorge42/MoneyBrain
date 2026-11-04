import { Button, Skeleton } from '@mantine/core'
import { BarChart3, Plus } from 'lucide-react'

export function ReportsLoadingState() {
  return (
    <div className="rep-loading" role="status" aria-busy="true" aria-live="polite">
      <span className="mb-sr-only">正在加载报表…</span>
      <Skeleton className="rep-skeleton-metrics" />
      <div className="rep-loading-tables">
        {Array.from({ length: 2 }, (_, tableIndex) => (
          <div className="rep-table-card" key={tableIndex}>
            <div className="rep-table-head">
              <Skeleton className="rep-skeleton-title" />
              <Skeleton className="rep-skeleton-meta" />
            </div>
            {Array.from({ length: 6 }, (_, rowIndex) => (
              <div className="rep-loading-row" key={rowIndex}>
                <Skeleton className="rep-skeleton-line" />
                <Skeleton className="rep-skeleton-num" />
                <Skeleton className="rep-skeleton-num" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

type ReportsEmptyStateProps = {
  onRecord: () => void
}

export function ReportsEmptyState({ onRecord }: ReportsEmptyStateProps) {
  return (
    <div className="hf-state">
      <div className="hf-state-icon"><BarChart3 aria-hidden /></div>
      <div>
        <h2 className="mb-title-4">这段时间还没有可汇总的记录</h2>
        <p className="mb-text-1 hf-state-copy">
          报表随记录自动生成。先记一笔，收入和支出会按类别汇总到这里；资产负债视图会从同一批记录长出。
        </p>
      </div>
      <Button className="mb-accent-btn" leftSection={<Plus />} onClick={onRecord}>记第一笔</Button>
    </div>
  )
}
