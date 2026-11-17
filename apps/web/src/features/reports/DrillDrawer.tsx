/**
 * 收支下钻抽屉：当期合计、二级类别与相关流水。
 * 数据由页面按当前期间派生，这里只渲染与动作。
 */
import { Button } from '@/features/shared/Button'
import { Sheet } from '@/features/shared/Sheet'
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
    <Sheet
      variant="report"
      device={device}
      opened={Boolean(data)}
      onClose={onClose}
      title={data ? `${data.title} · 下钻` : '下钻'}
      actions={
        <>
          <Button variant="ghost" onClick={onClose}>
            关闭
          </Button>
          <Button
            variant="primary"
            onClick={onViewFlow}
            disabled={data ? !data.canViewFlow : false}
            title={data && !data.canViewFlow ? '账户筛选暂不支持多选，待支持后可查看' : undefined}
          >
            在流水中查看
          </Button>
        </>
      }
    >
      {data && (
        <div className="mb-rp-drill">
          {!data.canViewFlow && (
            <p className="mb-rp-chart-note">
              该合并项含多个账户，流水筛选暂不支持多选，待支持后可在此查看。
            </p>
          )}
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
          <h4 className="mb-rp-drill-title">相关流水</h4>
          {data.transactions.length === 0 ? (
            <p className="mb-rp-empty-line">该期间没有相关流水</p>
          ) : (
            data.transactions.map((transaction) => (
              <div className="mb-rp-drill-row mb-rp-drill-row--tx" key={transaction.id}>
                <div>
                  <span className="mb-rp-drill-tx-head">
                    <span className="mb-rp-drill-tx-label">{transaction.label}</span>
                    {transaction.refund && <span className="mb-rp-drill-tag">退款</span>}
                  </span>
                  <span className="mb-rp-drill-meta">
                    {transaction.date.slice(5)} · {transaction.account}
                  </span>
                </div>
                <span className={`mb-rp-drill-value --${transaction.tone}`}>
                  {currency(transaction.amount)}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </Sheet>
  )
}
