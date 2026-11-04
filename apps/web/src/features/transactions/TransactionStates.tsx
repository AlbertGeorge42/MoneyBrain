import { Button, Skeleton } from '@mantine/core'
import { BookOpen, Plus, RefreshCw, SearchX, TriangleAlert } from 'lucide-react'

export function TransactionLoadingState() {
  return (
    <div className="tx-loading" role="status" aria-busy="true" aria-live="polite">
      <span className="mb-sr-only">正在加载流水…</span>
      <div className="tx-loading-head"><Skeleton className="tx-skeleton-line" /></div>
      {Array.from({ length: 7 }, (_, index) => (
        <div className="tx-loading-row" key={index}>
          <Skeleton className="tx-skeleton-icon" radius="sm" />
          <div className="tx-loading-text">
            <Skeleton className="tx-skeleton-line" />
            <Skeleton className="tx-skeleton-line tx-skeleton-line--short" />
          </div>
          <Skeleton className="tx-skeleton-amount" />
        </div>
      ))}
    </div>
  )
}

type ColdStartStateProps = {
  onRecord: () => void
}

export function ColdStartState({ onRecord }: ColdStartStateProps) {
  return (
    <div className="hf-state">
      <div className="hf-state-icon"><BookOpen aria-hidden /></div>
      <div>
        <h2 className="mb-title-4">账本还是空的</h2>
        <p className="mb-text-1 hf-state-copy">从第一笔开始。账户、流水、报表会随着记录自然长出来。</p>
      </div>
      <ol className="hf-steps">
        <li>
          <span className="hf-step-index mb-num">1</span>
          <div>
            <div className="hf-step-title">建一个账户</div>
            <div className="mb-text-0">微信零钱也可以，记账的落点只需一个。</div>
          </div>
        </li>
        <li>
          <span className="hf-step-index mb-num">2</span>
          <div>
            <div className="hf-step-title">记第一笔</div>
            <div className="mb-text-0">金额、分类、账户，三步完成。</div>
          </div>
        </li>
        <li>
          <span className="hf-step-index mb-num">3</span>
          <div>
            <div className="hf-step-title">回来看一眼</div>
            <div className="mb-text-0">流水按日分组，本月收支自动汇总。</div>
          </div>
        </li>
      </ol>
      <Button className="mb-accent-btn" leftSection={<Plus />} onClick={onRecord}>记第一笔</Button>
    </div>
  )
}

type NoResultStateProps = {
  onClear: () => void
}

export function NoResultState({ onClear }: NoResultStateProps) {
  return (
    <div className="hf-state hf-state--compact">
      <div className="hf-state-icon"><SearchX aria-hidden /></div>
      <div>
        <h2 className="mb-title-4">没有匹配的记录</h2>
        <p className="mb-text-1 hf-state-copy">换个关键词，或清空筛选条件再试。</p>
      </div>
      <Button variant="default" onClick={onClear}>清空筛选</Button>
    </div>
  )
}

type ErrorStateProps = {
  onRetry: () => void
  code?: string
}

export function ErrorState({ onRetry, code = 'SYNC-503' }: ErrorStateProps) {
  return (
    <div className="hf-state" role="alert">
      <div className="hf-state-icon hf-state-icon--error"><TriangleAlert aria-hidden /></div>
      <div>
        <h2 className="mb-title-4">数据没取出来</h2>
        <p className="mb-text-1 hf-state-copy">重试不会改动本地账本，已有记录仍在设备上。</p>
      </div>
      <div className="hf-error-meta">
        <span className="mb-num">错误码 {code}</span>
        <Button variant="default" leftSection={<RefreshCw />} onClick={onRetry}>重试</Button>
      </div>
    </div>
  )
}
