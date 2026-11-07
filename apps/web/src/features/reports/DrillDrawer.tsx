/**
 * 收支下钻抽屉：当期合计、二级类别与相关流水。
 * 数据由页面按当前期间派生，这里只渲染与动作。
 */
import { HfButton } from '@/features/shared/HfButton'
import { HfSheet } from '@/features/shared/HfSheet'
import type { DeviceMode } from '@/features/shared/types'
import { currency, type DrillData } from './reportsModel'

export function DrillDrawer({
  device,
  data,
  onClose,
  onViewFlow,
}: {
  device: DeviceMode
  data: DrillData | null
  onClose: () => void
  onViewFlow: () => void
}) {
  return (
    <HfSheet
      variant="report"
      device={device}
      opened={Boolean(data)}
      onClose={onClose}
      title={data ? `${data.title} · 下钻` : '下钻'}
      actions={
        <>
          <HfButton className="mb-rp-btn is-ghost" onClick={onClose}>
            关闭
          </HfButton>
          <HfButton className="mb-rp-btn is-primary" onClick={onViewFlow}>
            在流水中查看
          </HfButton>
        </>
      }
    >
      {data && (
        <div className="mb-rp-drill">
          <div className="mb-rp-drill-head">
            <span className="mb-rp-drill-label">当期合计</span>
            <span className={`mb-rp-drill-amount is-${data.tone}`}>
              {data.tone === 'income' ? '+' : '−'}
              {currency(data.amount)}
            </span>
          </div>
          <h4 className="mb-rp-drill-title">二级类别</h4>
          {data.children.length === 0 ? (
            <p className="mb-rp-empty-line">该分类没有二级类别</p>
          ) : (
            data.children.map((child) => (
              <div className="mb-rp-drill-row" key={child.id}>
                <span>{child.name}</span>
                <span className="mb-rp-drill-meta">{child.count} 笔</span>
                <span className="mb-rp-drill-value">{currency(child.amount)}</span>
              </div>
            ))
          )}
          <h4 className="mb-rp-drill-title">相关流水</h4>
          {data.transactions.length === 0 ? (
            <p className="mb-rp-empty-line">该期间没有相关流水</p>
          ) : (
            data.transactions.map((transaction) => (
              <div className="mb-rp-drill-row is-tx" key={transaction.id}>
                <div>
                  <span className="mb-rp-drill-tx-label">{transaction.label}</span>
                  <span className="mb-rp-drill-meta">
                    {transaction.date.slice(5)} · {transaction.account}
                  </span>
                </div>
                <span className={`mb-rp-drill-value is-${transaction.tone}`}>
                  {currency(transaction.amount)}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </HfSheet>
  )
}
