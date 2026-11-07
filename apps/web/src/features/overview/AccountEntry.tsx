import { ChevronRight } from 'lucide-react'
import { HfButton } from '@/features/shared/HfButton'
import { amountText } from './format'
import type { LedgerAccount, OverviewSummary } from './model'
import { CATEGORY_COLORS, stableSlotMap } from '@/features/shared/seriesColor'

export function AccountEntry({
  summary,
  accounts,
  onOpen,
}: {
  summary: OverviewSummary
  accounts: LedgerAccount[]
  onOpen: () => void
}) {
  // 圆点按账户 id 取色：账户顺序变化时，同一账户的颜色不跟着下标走。
  const visibleAccounts = accounts.slice(0, 3)
  const slots = stableSlotMap(
    visibleAccounts.map((account) => account.id),
    CATEGORY_COLORS.length,
  )
  return (
    <HfButton
      className="mb-account-entry"
      aria-label="账户与余额"
      onClick={onOpen}
    >
      <span className="mb-account-ledger" aria-hidden="true">
        账
      </span>
      <span className="mb-account-copy">
        <span className="mb-account-title">账户与余额</span>
        <span className="mb-account-meta">
          {accounts.length} 个账户 · 现金等价 {amountText(summary.liquidAssets)} · 投资{' '}
          {amountText(summary.investmentAssets)}
        </span>
      </span>
      <span className="mb-account-stack" aria-hidden="true">
        {visibleAccounts.map((account) => (
          <span
            key={account.id}
            className={`mb-account-dot mb-tone-cat-${(slots.get(account.id) ?? 0) + 1}`}
          >
            {account.name.slice(0, 1)}
          </span>
        ))}
      </span>
      <ChevronRight className="mb-account-chevron" size={18} aria-hidden="true" />
    </HfButton>
  )
}
