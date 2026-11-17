import { Fragment } from 'react'
import { ArrowRight } from 'lucide-react'
import { Card } from '@/features/shared/Card'
import { Button } from '@/features/shared/Button'
import { TxRow } from '@/features/shared/TxRow'
import type { Ledger, LedgerTransaction, RecentGroup } from './model'
import type { DeviceMode } from '@/features/shared/types'

export function RecentTransactions({
  device,
  groups,
  ledger,
  onOpenDetail,
  onOpenAll,
}: {
  device: DeviceMode
  groups: RecentGroup[]
  ledger: Ledger
  onOpenDetail: (transaction: LedgerTransaction) => void
  onOpenAll: () => void
}) {
  const count = groups.reduce((total, group) => total + group.items.length, 0)

  return (
    <Card className="mb-ov-recent-card">
      <div className="mb-shared-head">
        <div>
          <h2 className="mb-shared-sec-title">最近交易</h2>
          <p className="mb-shared-sec-desc">
            {count === 0 ? '还没有流水' : `最新 ${count} 笔`}
          </p>
        </div>
      </div>

      {count === 0 ? (
        <p className="mb-shared-inline">还没有流水，记下第一笔后这里会自动归档。</p>
      ) : (
        <div className="mb-tx-rows">
          {groups.map((group) => (
            <Fragment key={group.date}>
              <div className="mb-tx-group-row">
                <span className="mb-tx-group-label">{group.label}</span>
              </div>
              {group.items.map((transaction) => (
                <TxRow
                  key={transaction.id}
                  ledger={ledger}
                  transaction={transaction}
                  variant={device === 'mobile' ? 'mobile' : 'default'}
                  ariaLabel={`查看交易详情：${transaction.note}`}
                  onActivate={() => onOpenDetail(transaction)}
                  onOpenRelated={onOpenDetail}
                />
              ))}
            </Fragment>
          ))}
        </div>
      )}

      <Button variant="link" className="mb-shared-foot" onClick={onOpenAll}>
        查看全部流水
        <ArrowRight size={14} />
      </Button>
    </Card>
  )
}
