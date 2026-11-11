/**
 * 流水列表：PC 与移动端共用同一套行组件（TxRow），差异只在外壳与排版。
 *
 * 分批渲染：一屏只渲染前若干个日期分组，PC 点「查看更多」继续加载，
 * 移动端滚动到底自动加载。合计与笔数始终按完整筛选结果计算，
 * 不随已渲染的分组变化。
 */
import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { Check } from 'lucide-react'
import { TxRow } from '@/features/shared/TxRow'
import { Card } from '@/features/shared/Card'
import { HfButton } from '@/features/shared/HfButton'
import type { DisplaySettings } from './displaySettings'
import {
  signedMinorText,
  splitTotalsByToday,
  type GroupedTransactions,
} from './filters'
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
}: {
  device: 'desktop' | 'mobile'
  remaining: number
  onLoadMore: () => void
}) {
  // 移动端用哨兵元素自动加载：滚动到列表底部即追加下一批。
  const sentinelRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (device !== 'mobile' || remaining === 0) return
    const node = sentinelRef.current
    if (!node || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) onLoadMore()
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [device, remaining, onLoadMore])

  if (remaining === 0) return null

  return (
    <div className="mb-tx-load-more">
      {device === 'mobile' ? (
        <>
          <div ref={sentinelRef} className="mb-tx-load-more-sentinel" aria-hidden="true" />
          <span className="mb-tx-load-more-hint">下拉查看更多（还有 {remaining} 组）</span>
        </>
      ) : (
        <HfButton className="mb-tx-btn" onClick={onLoadMore}>
          查看更多（还有 {remaining} 组）
        </HfButton>
      )}
    </div>
  )
}

export function TransactionsList({
  device,
  groups,
  ledger,
  today,
  batchMode,
  display,
  selected,
  includeExcluded,
  onToggle,
  onOpenDetail,
  onOpenRelated,
}: {
  device: 'desktop' | 'mobile'
  groups: GroupedTransactions[]
  ledger: Ledger
  today: string
  batchMode: boolean
  display: DisplaySettings
  selected: ReadonlySet<string>
  includeExcluded: boolean
  onToggle: (id: string) => void
  onOpenDetail: (id: string) => void
  onOpenRelated?: (transaction: LedgerTransaction) => void
}) {
  const [visibleCount, setVisibleCount] = useState(GROUP_PAGE_SIZE)
  // 筛选结果变化时回到第一屏，避免上一批的滚动位置对应旧数据。
  useEffect(() => {
    setVisibleCount(GROUP_PAGE_SIZE)
  }, [groups])

  const visibleGroups = useMemo(() => groups.slice(0, visibleCount), [groups, visibleCount])
  const remainingGroups = groups.length - visibleGroups.length
  // 合计按完整筛选结果算，不随已渲染分组变化。
  const totals = useMemo(
    () =>
      splitTotalsByToday(groups.flatMap((group) => group.items), today, { includeExcluded }).current,
    [groups, today, includeExcluded],
  )

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
            <HfButton
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
            </HfButton>
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
                className={group.net >= 0 ? 'mb-tx-group-net is-income' : 'mb-tx-group-net is-expense'}
              >
                小计 {signedMinorText(group.net)}
              </span>
            </div>
            <Card as="div" className="mb-tx-m-card">
              {group.items.map(renderRow)}
            </Card>
          </div>
        ))}
        <LoadMore device={device} remaining={remainingGroups} onLoadMore={loadMore} />
        <div className="mb-tx-m-foot">
          <span>
            共 {totals.count} 笔 · 支出 {signedMinorText(-totals.expense)} · 收入 {signedMinorText(totals.income)}
          </span>
        </div>
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
                  className={group.net >= 0 ? 'mb-tx-group-net is-income' : 'mb-tx-group-net is-expense'}
                >
                  小计 {signedMinorText(group.net)}
                </span>
              </div>
              {group.items.map(renderRow)}
            </Fragment>
          ))}
        </div>
      </Card>
      <LoadMore device={device} remaining={remainingGroups} onLoadMore={loadMore} />
      {/* 合计条独立于列表卡片：卡片 overflow:hidden 会让 sticky 失效。 */}
      <div className="mb-tx-foot">
        <span className="mb-tx-foot-count">共 {totals.count} 笔</span>
        <span className="mb-tx-foot-flow">
          支出 <strong className="is-expense">{signedMinorText(-totals.expense)}</strong>
          收入 <strong className="is-income">{signedMinorText(totals.income)}</strong>
        </span>
      </div>
    </>
  )
}
