/**
 * 图表下钻抽屉：当期合计、下钻子项与相关流水。
 * 流水行复用流水页的 TxRow，点行直接打开可编辑的交易详情，不跳页。
 */
import { useEffect, useState } from 'react'
import { Sheet } from '@/features/shared/Sheet'
import { TxRow } from '@/features/shared/TxRow'
import { useLedger } from '@/features/overview/ledgerStore'
import { TransactionDetailPanel } from '@/features/transactions/TransactionDetailPanel'
import { useDetailActions } from '@/features/transactions/useDetailActions'
import { useTransactionDetail } from '@/features/transactions/transactionQuery'
import type { DeviceMode } from '@/features/shared/types'
import { currency, type DrillData } from './reportsModel'

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
  const { handleSave, handleDelete, handleLinkRefund, handleCreateRefund } = useDetailActions('reports')
  const [detailId, setDetailId] = useState<string | null>(null)

  useEffect(() => {
    if (!data) setDetailId(null)
  }, [data])

  // 详情优先取当前下钻行；关联方不在本次结果时按 id 服务端补查（不扫 Ledger 全量）。
  const { detail } = useTransactionDetail(detailId, data?.transactions ?? [])

  return (
    <>
      <Sheet
        variant="report"
        device={device}
        opened={Boolean(data)}
        onClose={onClose}
        title={data ? data.title : '下钻'}
      >
        {data && (
          <div className="mb-rp-drill">
            <div className="mb-rp-drill-head">
              <span className="mb-rp-drill-label">{data.amountLabel}</span>
              <span className={`mb-rp-drill-amount--${data.tone}`}>
                {currency(data.amount)}
                {Boolean(data.predicted) && <span className="mb-rp-predict-badge">预测</span>}
              </span>
            </div>
            {data.childTitle && data.children.length > 0 && (
              <>
                <h4 className="mb-rp-drill-title">{data.childTitle}</h4>
                {data.children.map((child) => (
                  <div className="mb-rp-drill-row" key={child.id}>
                    <span>{child.name}</span>
                    {data.showChildCount && <span className="mb-rp-drill-meta">{child.count} 笔</span>}
                    <span className="mb-rp-drill-value">
                      {currency(child.amount)}
                      {Boolean(child.predicted) && <span className="mb-rp-predict-badge">预测</span>}
                    </span>
                  </div>
                ))}
              </>
            )}
            <h4 className="mb-rp-drill-title">
              相关流水 <span className="mb-rp-drill-meta">共 {data.transactions.length} 笔</span>
            </h4>
            {data.transactions.length === 0 ? (
              <p className="mb-rp-empty-line">{data.emptyText}</p>
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
      <TransactionDetailPanel
        transaction={detail}
        ledger={ledger}
        device={device}
        onClose={() => setDetailId(null)}
        onSave={handleSave}
        onDelete={handleDelete}
        onOpenTransaction={(transaction) => setDetailId(transaction.id)}
        onLinkRefund={handleLinkRefund}
        onCreateRefund={handleCreateRefund}
      />
    </>
  )
}
