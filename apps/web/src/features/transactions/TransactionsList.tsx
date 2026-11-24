/**
 * 流水列表：PC 与移动端共用同一套行组件（TxRow），差异只在外壳与排版。
 *
 * 分批渲染：一屏只渲染前若干个日期分组，PC 点「查看更多」继续加载，
 * 移动端滚动到底自动加载。每组显示自身的小计。
 */
import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { Check } from 'lucide-react'
import { TxRow } from '@/features/shared/TxRow'
import { Card } from '@/features/shared/Card'
import { Button } from '@/features/shared/Button'
import type { DisplaySettings } from './displaySettings'
import { signedMinorText, type GroupedTransactions } from './filters'
import type { Ledger, LedgerTransaction } from '@/features/overview/model'

/** 一批渲染多少个日期分组。 */
const GROUP_PAGE_SIZE = 8

function CheckBox({ checked }: { checked: boolean }) {
  return (
    <span className={checked ? 'mb-tx-checkbox is-checked' : 'mb-tx-checkbox'} aria-hidden="true">
      {checked && <Check size={12} strokeWidth={2.4} />}
    </span>
  )
}

function LoadMore({
  device,
  remaining,
  onLoadMore,
  hasMoreRemote = false,
  loadingMore = false,
  onLoadMoreRemote,
}: {
  device: 'desktop' | 'mobile'
  remaining: number
  onLoadMore: () => void
  /** 服务端还有下一页（本地分组已全部展开时才显示）。 */
  hasMoreRemote?: boolean
  loadingMore?: boolean
  onLoadMoreRemote?: () => void
}) {
  // 移动端用哨兵元素自动加载：滚动到列表底部先展开本地分组，取尽后再向服务端要下一页。
  const sentinelRef = useRef<HTMLDivElement>(null)
  const remoteRemaining = remaining === 0 && hasMoreRemote
  useEffect(() => {
    if (device !== 'mobile' || (remaining === 0 && !remoteRemaining)) return
    const node = sentinelRef.current
    if (!node || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return
      if (remaining > 0) onLoadMore()
      else if (hasMoreRemote && !loadingMore) onLoadMoreRemote?.()
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [device, remaining, remoteRemaining, hasMoreRemote, loadingMore, onLoadMore, onLoadMoreRemote])

  if (remaining === 0 && !remoteRemaining) return null

  return (
    <div className="mb-tx-load-more">
      {device === 'mobile' ? (
        <>
          <div ref={sentinelRef} className="mb-tx-load-more-sentinel" aria-hidden="true" />
          <span className="mb-tx-load-more-hint">
            {remaining > 0
              ? '下拉查看更多'
              : loadingMore
                ? '正在加载更多流水…'
                : '下拉加载更多流水'}
          </span>
        </>
      ) : remaining > 0 ? (
        <Button variant="secondary" onClick={onLoadMore}>
          查看更多
        </Button>
      ) : (
        <Button variant="secondary" disabled={loadingMore} onClick={onLoadMoreRemote}>
          {loadingMore ? '加载中…' : '加载更多流水'}
        </Button>
      )}
    </div>
  )
}

export function TransactionsList({
  device,
  groups,
  ledger,
  batchMode,
  display,
  selected,
  onToggle,
  onOpenDetail,
  onOpenRelated,
  hasMoreRemote = false,
  loadingMore = false,
  onLoadMoreRemote,
}: {
  device: 'desktop' | 'mobile'
  groups: GroupedTransactions[]
  ledger: Ledger
  batchMode: boolean
  display: DisplaySettings
  selected: ReadonlySet<string>
  onToggle: (id: string) => void
  onOpenDetail: (id: string) => void
  onOpenRelated?: (transaction: LedgerTransaction) => void
  /** 服务端分页：本地分组取尽后按需加载下一页。 */
  hasMoreRemote?: boolean
  loadingMore?: boolean
  onLoadMoreRemote?: () => void
}) {
  const [visibleCount, setVisibleCount] = useState(GROUP_PAGE_SIZE)
  // 筛选结果变化时回到第一屏，避免上一批的滚动位置对应旧数据。
  useEffect(() => {
    setVisibleCount(GROUP_PAGE_SIZE)
  }, [groups])

  const visibleGroups = useMemo(() => groups.slice(0, visibleCount), [groups, visibleCount])
  const remainingGroups = groups.length - visibleGroups.length

  const renderRow = (transaction: LedgerTransaction) => {
    const isSelected = selected.has(transaction.id)
    return (
      <TxRow
        key={transaction.id}
        ledger={ledger}
        transaction={transaction}
        showNote={display.showNote}
        showAccount={display.showAccount}
        variant={device === 'mobile' ? 'mobile' : 'default'}
        selected={isSelected}
        ariaLabel={batchMode ? `选择 ${transaction.note}` : `查看 ${transaction.note} 详情`}
        onActivate={() => (batchMode ? onToggle(transaction.id) : onOpenDetail(transaction.id))}
        onOpenRelated={onOpenRelated}
        leading={
          batchMode ? (
            <Button
              role="checkbox"
              aria-checked={isSelected}
              aria-label={`选择 ${transaction.note}`}
              className="mb-tx-check-btn"
              onClick={(event) => {
                event.stopPropagation()
                onToggle(transaction.id)
              }}
            >
              <CheckBox checked={isSelected} />
            </Button>
          ) : undefined
        }
      />
    )
  }

  const loadMore = () => setVisibleCount((count) => count + GROUP_PAGE_SIZE)

  if (device === 'mobile') {
    return (
      <section className="mb-tx-m-list" aria-label="流水列表">
        {visibleGroups.map((group) => (
          <div key={group.date} className="mb-tx-m-group">
            <div className="mb-tx-m-group-head">
              <span className="mb-tx-group-label">
                {group.label}
                {group.future && <span className="mb-tx-group-count">{group.items.length} 笔</span>}
              </span>
              <span
                className={group.net >= 0 ? 'mb-tx-group-net --income' : 'mb-tx-group-net --expense'}
              >
                小计 {signedMinorText(group.net)}
              </span>
            </div>
            <Card as="div" className="mb-tx-m-card">
              {group.items.map(renderRow)}
            </Card>
          </div>
        ))}
        <LoadMore
          device={device}
          remaining={remainingGroups}
          onLoadMore={loadMore}
          hasMoreRemote={hasMoreRemote}
          loadingMore={loadingMore}
          onLoadMoreRemote={onLoadMoreRemote}
        />
      </section>
    )
  }

  return (
    <>
      <Card className="mb-tx-list-card" aria-label="流水列表">
        <div className="mb-tx-rows">
          {visibleGroups.map((group) => (
            <Fragment key={group.date}>
              <div className="mb-tx-group-row">
                <span className="mb-tx-group-label">
                  {group.label}
                  {group.future && <span className="mb-tx-group-count">{group.items.length} 笔</span>}
                </span>
                <span
                  className={group.net >= 0 ? 'mb-tx-group-net --income' : 'mb-tx-group-net --expense'}
                >
                  小计 {signedMinorText(group.net)}
                </span>
              </div>
              {group.items.map(renderRow)}
            </Fragment>
          ))}
        </div>
      </Card>
      <LoadMore
        device={device}
        remaining={remainingGroups}
        onLoadMore={loadMore}
        hasMoreRemote={hasMoreRemote}
        loadingMore={loadingMore}
        onLoadMoreRemote={onLoadMoreRemote}
      />
    </>
  )
}
