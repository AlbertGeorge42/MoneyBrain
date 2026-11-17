/**
 * 图表下钻抽屉：当期合计、下钻子项与相关流水。
 * 流水行复用流水页的 TxRow，点行直接打开可编辑的交易详情，不跳页。
 */
import { useEffect, useState } from 'react'
import { Button } from '@/features/shared/Button'
import { Sheet } from '@/features/shared/Sheet'
import { TxRow } from '@/features/shared/TxRow'
import { useLedger } from '@/features/overview/ledgerStore'
import { TransactionDetailPanel } from '@/features/transactions/TransactionDetailPanel'
import { useDetailActions } from '@/features/transactions/useDetailActions'
import type { DeviceMode } from '@/features/shared/types'
import { currency, type DrillData } from './reportsModel'
import type { Ledger, LedgerTransaction } from '@/features/overview/model'

/** 详情写动作只在真正打开详情时挂载，避免关闭状态下依赖 ToastProvider。 */
function DetailEditor({
  transaction,
  ledger,
  device,
  onClose,
  onOpenTransaction,
}: {
  transaction: LedgerTransaction
  ledger: Ledger
  device: DeviceMode
  onClose: () => void
  onOpenTransaction: (transaction: LedgerTransaction) => void
}) {
  const { handleSave, handleDelete, handleLinkRefund } = useDetailActions('reports')
  return (
    <TransactionDetailPanel
      transaction={transaction}
      ledger={ledger}
      device={device}
      onClose={onClose}
      onSave={handleSave}
      onDelete={handleDelete}
      onOpenTransaction={onOpenTransaction}
      onLinkRefund={handleLinkRefund}
    />
  )
}

export function DrillDrawer({
  device,
  data,
  onClose,
}: {
  device: DeviceMode
  data: DrillData | null
  onClose: () => void
}) {
  const { ledger } = useLedger()
  const [detailId, setDetailId] = useState<string | null>(null)

  useEffect(() => {
    if (!data) setDetailId(null)
  }, [data])

  const detail = ledger.transactions.find((transaction) => transaction.id === detailId) ?? null

  return (
    <>
      <Sheet
        variant="report"
        device={device}
        opened={Boolean(data)}
        onClose={onClose}
        title={data ? `${data.title} · 下钻` : '下钻'}
        actions={
          <Button variant="ghost" onClick={onClose}>
            关闭
          </Button>
        }
      >
        {data && (
          <div className="mb-rp-drill">
            <div className="mb-rp-drill-head">
              <span className="mb-rp-drill-label">当期合计</span>
              <span className={`mb-rp-drill-amount --${data.tone}`}>
                {currency(data.amount)}
              </span>
            </div>
            {data.childTitle && (
              <>
                <h4 className="mb-rp-drill-title">{data.childTitle}</h4>
                {data.children.length === 0 ? (
                  <p className="mb-rp-empty-line">没有下一级{data.childTitle}</p>
                ) : (
                  data.children.map((child) => (
                    <div className="mb-rp-drill-row" key={child.id}>
                      <span>{child.name}</span>
                      <span className="mb-rp-drill-meta">{child.count} 笔</span>
                      <span className="mb-rp-drill-value">{currency(child.amount)}</span>
                    </div>
                  ))
                )}
              </>
            )}
            <h4 className="mb-rp-drill-title">
              相关流水 <span className="mb-rp-drill-meta">共 {data.transactions.length} 笔</span>
            </h4>
            {data.transactions.length === 0 ? (
              <p className="mb-rp-empty-line">该期间没有相关流水</p>
            ) : (
              data.transactions.map((transaction) => (
                <TxRow
                  key={transaction.id}
                  ledger={ledger}
                  transaction={transaction}
                  variant={device === 'mobile' ? 'mobile' : 'default'}
                  onActivate={() => setDetailId(transaction.id)}
                  onOpenRelated={(related) => setDetailId(related.id)}
                />
              ))
            )}
          </div>
        )}
      </Sheet>
      {detail && (
        <DetailEditor
          transaction={detail}
          ledger={ledger}
          device={device}
          onClose={() => setDetailId(null)}
          onOpenTransaction={(transaction) => setDetailId(transaction.id)}
        />
      )}
    </>
  )
}
