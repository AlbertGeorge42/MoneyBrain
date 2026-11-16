import { Button as MantineButton, Modal } from '@mantine/core'
import { CategoryIcon } from './category'
import { amountText, signedAmountText } from './format'
import {
  accountKindLabel,
  formatDateLabel,
  getAccount,
  getCategoryIconKey,
  getCategoryName,
  getCategoryRootId,
  getRefundList,
  getRefundSummary,
  getRelatedTransaction,
  transactionDirection,
  transactionRefLabel,
  transactionTone,
  type Ledger,
  type LedgerTransaction,
} from './model'
import type { DeviceMode } from '@/features/shared/types'
import { Button } from '@/features/shared/Button'
import { Sheet } from '@/features/shared/Sheet'
import './overlays.css'

function DetailBody({
  transaction,
  ledger,
  onClose,
  onOpenTransaction,
}: {
  transaction: LedgerTransaction
  ledger: Ledger
  onClose: () => void
  onOpenTransaction: (transaction: LedgerTransaction) => void
}) {
  const tone = transactionTone(transaction)
  const category = getCategoryName(ledger, transaction.categoryId)
  const rootId = getCategoryRootId(ledger, transaction.categoryId)
  const iconKey = getCategoryIconKey(ledger, transaction.categoryId)
  const account = getAccount(ledger, transaction.accountId)
  const toAccount = transaction.toAccountId ? getAccount(ledger, transaction.toAccountId) : undefined
  const related = transaction.type === 'refund' ? getRelatedTransaction(ledger, transaction) : undefined
  const refundSummary =
    transaction.type === 'expense' || transaction.type === 'income'
      ? getRefundSummary(ledger, transaction)
      : null
  const refunds = refundSummary ? getRefundList(ledger, transaction) : []

  return (
    <div className="mb-ov-detail">
      <div className="mb-ov-detail-hero">
        <span className={`mb-ov-detail-amount --${tone}`}>{signedAmountText(transaction)}</span>
        <span className="mb-ov-detail-meta">
          <span className={`mb-ov-badge --${tone}`}>{transactionDirection(transaction)}</span>
          <span>{formatDateLabel(transaction.date)}</span>
        </span>
      </div>

      <dl className="mb-ov-list">
        <div>
          <dt>分类</dt>
          <dd>
            <span className="mb-ov-category">
              <CategoryIcon rootId={rootId} iconKey={iconKey} />
              {category}
            </span>
          </dd>
        </div>
        <div>
          <dt>账户</dt>
          <dd>
            {account ? `${account.name} · ${accountKindLabel(account.kind)}` : '未知账户'}
          </dd>
        </div>
        {toAccount && (
          <div>
            <dt>转入账户</dt>
            <dd>
              {toAccount.name} · {accountKindLabel(toAccount.kind)}
            </dd>
          </div>
        )}
        {transaction.type === 'refund' && (
          <div>
            <dt>原交易</dt>
            <dd>
              {related ? (
                <Button
                  className="mb-ov-link"
                  onClick={() => onOpenTransaction(related)}
                >
                  {`关联 #${transactionRefLabel(ledger, related)} · ${formatDateLabel(related.date)} · ${signedAmountText(related)}`}
                </Button>
              ) : (
                <span className="mb-ov-muted">未关联原交易（仍按退款记账）</span>
              )}
            </dd>
          </div>
        )}
        {refundSummary && refundSummary.state !== 'none' && (
          <div>
            <dt>退款</dt>
            <dd>
              <span className="mb-ov-refund-summary">
                已退款 {amountText(refundSummary.refunded)} / 剩余 {amountText(refundSummary.remaining)}
                {refundSummary.state === 'full' && <span className="mb-ov-refund-badge">已全额退款</span>}
              </span>
              {refunds.length > 0 && (
                <span className="mb-ov-refund-items">
                  {refunds.map((refund) => (
                    <Button
                      key={refund.id}
                      className="mb-ov-refund-item"
                      onClick={() => onOpenTransaction(refund)}
                    >
                      <span>{formatDateLabel(refund.date)}</span>
                      <span className="mb-ov-refund-item-note">{refund.note || '退款'}</span>
                      <span className="mb-ov-refund-item-amount">{amountText(refund.amount)}</span>
                    </Button>
                  ))}
                </span>
              )}
            </dd>
          </div>
        )}
        <div>
          <dt>备注</dt>
          <dd>{transaction.note}</dd>
        </div>
        <div>
          <dt>交易编号</dt>
          <dd className="mb-ov-code">{transaction.id}</dd>
        </div>
      </dl>

      <div className="mb-ov-actions">
        <MantineButton variant="default" className="mb-shared-btn--secondary" onClick={onClose}>
          关闭
        </MantineButton>
      </div>
    </div>
  )
}

export function TransactionDetail({
  transaction,
  ledger,
  device,
  onClose,
  onOpenTransaction,
}: {
  transaction: LedgerTransaction | null
  ledger: Ledger
  device: DeviceMode
  onClose: () => void
  onOpenTransaction: (transaction: LedgerTransaction) => void
}) {
  if (!transaction) return null

  const title = (
    <span className="mb-ov-title-copy">
      <span className="mb-ov-overlay-title">交易详情</span>
      <span className="mb-ov-sub">{formatDateLabel(transaction.date)}</span>
    </span>
  )

  if (device === 'mobile') {
    return (
      <Sheet variant="overview" device={device} opened onClose={onClose} title={title}>
        <DetailBody
          transaction={transaction}
          ledger={ledger}
          onClose={onClose}
          onOpenTransaction={onOpenTransaction}
        />
      </Sheet>
    )
  }

  return (
    <Modal
      opened
      onClose={onClose}
      centered
      size="auto"
      withinPortal={false}
      title={title}
      classNames={{
        content: 'mb-shared-modal',
        header: 'mb-ov-overlay-head',
        title: 'mb-ov-title-wrap',
        body: 'mb-ov-body',
        overlay: 'mb-ov-overlay',
        close: 'mb-ov-close',
      }}
    >
      <DetailBody
        transaction={transaction}
        ledger={ledger}
        onClose={onClose}
        onOpenTransaction={onOpenTransaction}
      />
    </Modal>
  )
}
