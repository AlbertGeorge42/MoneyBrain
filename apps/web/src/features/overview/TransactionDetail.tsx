import { Button, Drawer, Modal } from '@mantine/core'
import { CategoryIcon } from './category'
import { signedAmountText } from './format'
import {
  accountKindLabel,
  formatDateLabel,
  getAccount,
  getCategoryName,
  getCategoryRootId,
  transactionDirection,
  transactionTone,
  type Ledger,
  type LedgerTransaction,
} from './model'
import type { DeviceMode } from '@/features/shared/types'
import './overlays.css'

function DetailBody({
  transaction,
  ledger,
  onClose,
}: {
  transaction: LedgerTransaction
  ledger: Ledger
  onClose: () => void
}) {
  const tone = transactionTone(transaction)
  const category = getCategoryName(ledger, transaction.categoryId)
  const rootId = getCategoryRootId(ledger, transaction.categoryId)
  const account = getAccount(ledger, transaction.accountId)
  const toAccount = transaction.toAccountId ? getAccount(ledger, transaction.toAccountId) : undefined

  return (
    <div className="mb-detail">
      <div className="mb-detail-hero">
        <span className={`mb-detail-amount is-${tone}`}>{signedAmountText(transaction)}</span>
        <span className="mb-detail-meta">
          <span className={`mb-detail-badge is-${tone}`}>{transactionDirection(transaction)}</span>
          <span>{formatDateLabel(transaction.date)}</span>
        </span>
      </div>

      <dl className="mb-detail-list">
        <div>
          <dt>分类</dt>
          <dd>
            <span className="mb-detail-category">
              <CategoryIcon rootId={rootId} />
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
        <div>
          <dt>备注</dt>
          <dd>{transaction.note}</dd>
        </div>
        <div>
          <dt>交易编号</dt>
          <dd className="mb-detail-code">{transaction.id}</dd>
        </div>
      </dl>

      <p className="mb-detail-note">数据只在本机；这笔记录不会上传到任何服务器。</p>

      <div className="mb-entry-actions">
        <Button variant="default" className="mb-secondary-btn" onClick={onClose}>
          关闭
        </Button>
      </div>
    </div>
  )
}

export function TransactionDetail({
  transaction,
  ledger,
  device,
  onClose,
}: {
  transaction: LedgerTransaction | null
  ledger: Ledger
  device: DeviceMode
  onClose: () => void
}) {
  if (!transaction) return null

  const title = (
    <span className="mb-overlay-title-copy">
      <span className="mb-overlay-title">交易详情</span>
      <span className="mb-overlay-sub">{formatDateLabel(transaction.date)}</span>
    </span>
  )

  if (device === 'mobile') {
    return (
      <Drawer
        opened
        onClose={onClose}
        position="bottom"
        size="auto"
        withinPortal={false}
        title={title}
        classNames={{
          content: 'mb-sheet',
          header: 'mb-overlay-head',
          title: 'mb-overlay-title-wrap',
          body: 'mb-overlay-body',
          overlay: 'mb-overlay',
          close: 'mb-overlay-close',
        }}
      >
        <DetailBody transaction={transaction} ledger={ledger} onClose={onClose} />
      </Drawer>
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
        content: 'mb-modal',
        header: 'mb-overlay-head',
        title: 'mb-overlay-title-wrap',
        body: 'mb-overlay-body',
        overlay: 'mb-overlay',
        close: 'mb-overlay-close',
      }}
    >
      <DetailBody transaction={transaction} ledger={ledger} onClose={onClose} />
    </Modal>
  )
}
